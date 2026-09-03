import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  answeredGrillCount,
  latestSpec,
  latestVerdict,
  requireJob,
  requireProject,
} from "./lib/docs";
import { assertTransition, laneOf, largeAndThinSpec } from "./lib/jobState";
import {
  answer,
  artifactKind,
  askKind,
  askStatus,
  jobStatus,
  projectKind,
  question,
  runStatus,
  runtime,
  stageKey,
} from "./lib/validators";
import { v } from "convex/values";

const jobDoc = v.object({
  _id: v.id("jobs"),
  _creationTime: v.number(),
  projectId: v.id("projects"),
  recipeId: v.id("recipes"),
  request: v.string(),
  runtime: runtime,
  forceGrill: v.boolean(),
  status: jobStatus,
  stageKey: stageKey,
  acceptedSpec: v.optional(v.string()),
  error: v.optional(v.string()),
});

const runDoc = v.object({
  _id: v.id("runs"),
  _creationTime: v.number(),
  jobId: v.id("jobs"),
  stageKey: stageKey,
  status: runStatus,
  runtime: runtime,
  grillAttached: v.boolean(),
  agentId: v.optional(v.string()),
  cursorRunId: v.optional(v.string()),
  error: v.optional(v.string()),
});

const askDoc = v.object({
  _id: v.id("asks"),
  _creationTime: v.number(),
  runId: v.id("runs"),
  jobId: v.id("jobs"),
  kind: askKind,
  questions: v.array(question),
  answers: v.optional(v.array(answer)),
  status: askStatus,
});

const artifactDoc = v.object({
  _id: v.id("artifacts"),
  _creationTime: v.number(),
  jobId: v.id("jobs"),
  runId: v.id("runs"),
  kind: artifactKind,
  body: v.string(),
});

const messageDoc = v.object({
  _id: v.id("runMessages"),
  _creationTime: v.number(),
  runId: v.id("runs"),
  jobId: v.id("jobs"),
  text: v.string(),
  createdAt: v.number(),
});

const jobView = v.object({
  job: jobDoc,
  project: v.object({
    _id: v.id("projects"),
    name: v.string(),
    kind: projectKind,
    localPath: v.string(),
    githubRepo: v.string(),
  }),
  runs: v.array(runDoc),
  asks: v.array(askDoc),
  artifacts: v.array(artifactDoc),
  messages: v.array(messageDoc),
  pendingAsk: v.union(askDoc, v.null()),
});

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      job: jobDoc,
      projectName: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const jobs = await ctx.db.query("jobs").order("desc").collect();
    const rows = [];
    for (const job of jobs) {
      const project = await ctx.db.get(job.projectId);
      rows.push({ job, projectName: project?.name ?? "missing" });
    }
    return rows;
  },
});

export const get = query({
  args: { jobId: v.id("jobs") },
  returns: v.union(jobView, v.null()),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;
    const project = await ctx.db.get(job.projectId);
    if (!project) return null;
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    const asks = await ctx.db
      .query("asks")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    const artifacts = await ctx.db
      .query("artifacts")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    const messages = [];
    for (const run of runs) {
      const rows = await ctx.db
        .query("runMessages")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      messages.push(...rows);
    }
    messages.sort((a, b) => a.createdAt - b.createdAt);
    const pendingAsk = asks.find((a) => a.status === "pending") ?? null;
    return {
      job,
      project: {
        _id: project._id,
        name: project.name,
        kind: project.kind,
        localPath: project.localPath,
        githubRepo: project.githubRepo,
      },
      runs,
      asks,
      artifacts,
      messages,
      pendingAsk,
    };
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    request: v.string(),
    runtime: runtime,
    forceGrill: v.boolean(),
  },
  returns: v.id("jobs"),
  handler: async (ctx, args) => {
    if (args.request.trim() === "") throw new Error("Request is required");
    await requireProject(ctx, args.projectId);
    const recipe = await ctx.db
      .query("recipes")
      .withIndex("by_slug", (q) => q.eq("slug", "feature"))
      .unique();
    if (!recipe) throw new Error("Feature recipe is not seeded");
    const jobId = await ctx.db.insert("jobs", {
      projectId: args.projectId,
      recipeId: recipe._id,
      request: args.request,
      runtime: args.runtime,
      forceGrill: args.forceGrill,
      status: "queued",
      stageKey: "plan",
    });
    await ctx.db.insert("runs", {
      jobId,
      stageKey: "plan",
      status: "queued",
      runtime: args.runtime,
      grillAttached: args.forceGrill,
    });
    return jobId;
  },
});

export const answerAsk = mutation({
  args: {
    askId: v.id("asks"),
    answers: v.array(answer),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ask = await ctx.db.get(args.askId);
    if (!ask) throw new Error("Ask not found");
    if (ask.status !== "pending") throw new Error("Ask is already answered");
    const job = await requireJob(ctx, ask.jobId);
    const run = await ctx.db.get(ask.runId);
    if (!run) throw new Error("Run not found");
    await ctx.db.patch(args.askId, { answers: args.answers, status: "answered" });
    if (laneOf(job.status) === "needsDetail") {
      assertTransition(job.status, "planning");
      await ctx.db.patch(job._id, { status: "planning" });
    }
    await ctx.db.patch(run._id, { status: "running" });
    return null;
  },
});

export const acceptSpec = mutation({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    if (laneOf(job.status) !== "planReview") {
      throw new Error("Job is not waiting for a spec");
    }
    const spec = await latestSpec(ctx, job._id);
    if (!spec) throw new Error("No spec artifact");
    const verdict = await latestVerdict(ctx, job._id);
    if (largeAndThinSpec(job.forceGrill, verdict)) {
      const grilled = await answeredGrillCount(ctx, job._id);
      if (grilled === 0) throw new Error("Large thin spec still needs a grill Ask");
    }
    assertTransition(job.status, "building");
    await ctx.db.patch(job._id, {
      status: "building",
      stageKey: "implement",
      acceptedSpec: spec,
    });
    await enqueueStage(ctx, job._id, "implement", job.runtime);
    return null;
  },
});

export const rejectSpec = mutation({
  args: { jobId: v.id("jobs"), note: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    if (laneOf(job.status) !== "planReview") {
      throw new Error("Job is not waiting for a spec");
    }
    assertTransition(job.status, "planning");
    await ctx.db.patch(job._id, { status: "planning", stageKey: "plan" });
    const runId = await enqueueStage(ctx, job._id, "plan", job.runtime);
    await ctx.db.insert("runMessages", {
      runId,
      jobId: job._id,
      text: `Spec sent back: ${args.note}`,
      createdAt: Date.now(),
    });
    return null;
  },
});

async function enqueueStage(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  key: "plan" | "implement" | "verify" | "pr",
  runtimeValue: "local" | "cloud",
): Promise<Id<"runs">> {
  return await ctx.db.insert("runs", {
    jobId,
    stageKey: key,
    status: "queued",
    runtime: runtimeValue,
    grillAttached: false,
  });
}

export const acceptCodeReview = mutation({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
    if (laneOf(job.status) !== "codeReview") {
      throw new Error("Job is not in code review");
    }
    assertTransition(job.status, "pr");
    await ctx.db.patch(job._id, { status: "pr", stageKey: "pr" });
    await enqueueStage(ctx, job._id, "pr", job.runtime);
    return null;
  },
});

export const migrateLanes = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const jobs = await ctx.db.query("jobs").collect();
    let n = 0;
    for (const job of jobs) {
      const lane = laneOf(job.status);
      if (lane === job.status) continue;
      await ctx.db.patch(job._id, { status: lane });
      n += 1;
    }
    return n;
  },
});
