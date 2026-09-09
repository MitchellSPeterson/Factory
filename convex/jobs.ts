import { requireProjectServer } from "./lib/servers";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  answeredGrillCount,
  latestSpec,
  latestVerdict,
  requireJob,
  requireProject,
  stagesOfRecipe,
} from "./lib/docs";
import {
  applyJobCommand,
  applyJobWrites,
  MAX_MESSAGE_LENGTH,
  deriveControlView,
  toAggregate,
  type JobCommand,
} from "./lib/jobControl";
import { assertTransition, laneOf, largeAndThinSpec } from "./lib/jobState";
import { firstStage, isPrStage, nextStage } from "./lib/recipeGraph";
import {
  answer,
  artifactKind,
  askKind,
  askStatus,
  chatDelivery,
  jobActivity,
  jobCommand,
  jobCommandKind,
  jobStatus,
  messageDelivery,
  projectKind,
  question,
  runStatus,
  runtime,
  stageKey,
  tokenUsage,
  contextBreakdown,
} from "./lib/validators";
import { v } from "convex/values";
import { isZeroUsage, subUsage, ZERO_USAGE } from "./lib/tokenUsage";

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
  githubIssueUrl: v.optional(v.string()),
  milestone: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
  usage: v.optional(tokenUsage),
  durationMs: v.optional(v.number()),
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
  endedByCommandId: v.optional(v.id("jobCommands")),
  usage: v.optional(tokenUsage),
  contextBreakdown: v.optional(contextBreakdown),
  startedAt: v.optional(v.number()),
  endedAt: v.optional(v.number()),
  durationMs: v.optional(v.number()),
});

const commandDoc = v.object({
  _id: v.id("jobCommands"),
  _creationTime: v.number(),
  jobId: v.id("jobs"),
  commandId: v.string(),
  command: jobCommand,
  delivery: v.optional(messageDelivery),
});

const controlView = v.object({
  activity: jobActivity,
  availableCommands: v.array(jobCommandKind),
  stages: v.array(
    v.object({
      stageKey: stageKey,
      latestRunId: v.union(v.id("runs"), v.null()),
      availableCommands: v.array(jobCommandKind),
      chatDelivery: chatDelivery,
    }),
  ),
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
    recipeId: v.optional(v.id("recipes")),
  }),
  recipeName: v.string(),
  runs: v.array(runDoc),
  asks: v.array(askDoc),
  artifacts: v.array(artifactDoc),
  messages: v.array(messageDoc),
  commands: v.array(commandDoc),
  control: controlView,
  pendingAsk: v.union(askDoc, v.null()),
});

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      job: jobDoc,
      projectName: v.string(),
      recipeName: v.string(),
      liveStartedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx) => {
    const jobs = await ctx.db.query("jobs").order("desc").collect();
    const openRuns = [
      ...(await ctx.db.query("runs").withIndex("by_status", (q) => q.eq("status", "running")).collect()),
      ...(await ctx.db.query("runs").withIndex("by_status", (q) => q.eq("status", "awaitingAsk")).collect()),
    ];
    const liveByJob = new Map<string, number>();
    for (const run of openRuns) {
      if (run.startedAt === undefined || run.endedAt !== undefined) continue;
      const prev = liveByJob.get(run.jobId);
      if (prev === undefined || run.startedAt < prev) liveByJob.set(run.jobId, run.startedAt);
    }
    const rows = [];
    for (const job of jobs) {
      const project = await ctx.db.get(job.projectId);
      const recipe = await ctx.db.get(job.recipeId);
      rows.push({
        job,
        projectName: project?.name ?? "missing",
        recipeName: recipe?.name ?? "missing",
        liveStartedAt: liveByJob.get(job._id),
      });
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
    const commands = await ctx.db
      .query("jobCommands")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    const pendingAsk =
      asks.find(
        (a) =>
          a.status === "pending" &&
          runs.find((run) => run._id === a.runId)?.status === "awaitingAsk",
      ) ?? null;
    const recipe = await ctx.db.get(job.recipeId);
    const stages = [];
    for (const stage of await stagesOfRecipe(ctx, job.recipeId)) {
      const profile = stage.agentProfileId ? await ctx.db.get(stage.agentProfileId) : null;
      stages.push({ key: stage.key, provider: profile?.provider });
    }
    return {
      job,
      project: {
        _id: project._id,
        name: project.name,
        kind: project.kind,
        localPath: project.localPath,
        githubRepo: project.githubRepo,
        recipeId: project.recipeId,
      },
      recipeName: recipe?.name ?? "missing",
      runs,
      asks,
      artifacts,
      messages,
      commands,
      control: deriveControlView(toAggregate(job, runs, asks), stages),
      pendingAsk,
    };
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    accessKey: v.optional(v.string()),
    request: v.string(),
    runtime: runtime,
    forceGrill: v.boolean(),
    recipeId: v.optional(v.id("recipes")),
    githubIssueUrl: v.optional(v.string()),
    milestone: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.id("jobs"),
  handler: async (ctx, args) => {
    if (args.request.trim() === "") throw new Error("Request is required");
    if ((args.tags?.length ?? 0) > 20) throw new Error("A Job can have at most 20 tags");
    const project = await requireProject(ctx, args.projectId);
    await requireProjectServer(ctx, project, args.accessKey);
    if (project.serverId && project.cloneStatus !== "ready") throw new Error("Wait for the Project to finish cloning before starting a Job.");
    const recipeId =
      args.recipeId ??
      project.recipeId ??
      (
        await ctx.db
          .query("recipes")
          .withIndex("by_slug", (q) => q.eq("slug", "feature"))
          .unique()
      )?._id;
    if (!recipeId) throw new Error("Workflow is not seeded");
    const recipe = await ctx.db.get(recipeId);
    if (!recipe) throw new Error("Workflow not found");
    const start = firstStage(await stagesOfRecipe(ctx, recipe._id));
    if (!start) throw new Error("Workflow has no Stages");
    const jobId = await ctx.db.insert("jobs", {
      projectId: args.projectId,
      recipeId: recipe._id,
      request: args.request,
      runtime: args.runtime,
      forceGrill: args.forceGrill,
      status: "queued",
      stageKey: start.key,
      githubIssueUrl: args.githubIssueUrl?.trim() || undefined,
      milestone: args.milestone?.trim() || undefined,
      tags: args.tags?.map((tag) => tag.trim()).filter(Boolean),
    });
    await ctx.db.insert("runs", {
      jobId,
      stageKey: start.key,
      status: "queued",
      runtime: args.runtime,
      grillAttached: args.forceGrill,
    });
    return jobId;
  },
});

const commandReceipt = v.object({
  kind: v.union(v.literal("applied"), v.literal("unchanged")),
  reason: v.optional(
    v.union(
      v.literal("duplicate"),
      v.literal("alreadyTerminal"),
      v.literal("alreadyStopped"),
      v.literal("notStopped"),
      v.literal("superseded"),
    ),
  ),
  commandId: v.id("jobCommands"),
});

function requireMessageText(text: string): string {
  const trimmed = text.trim();
  if (trimmed === "") throw new Error("A message is required");
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`A message can be at most ${MAX_MESSAGE_LENGTH} characters`);
  }
  return trimmed;
}

async function dispatch(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  commandId: string,
  input: JobCommand,
) {
  const job = await requireJob(ctx, jobId);
  const existing = await ctx.db
    .query("jobCommands")
    .withIndex("by_job_and_commandId", (q) =>
      q.eq("jobId", job._id).eq("commandId", commandId),
    )
    .unique();
  if (existing) {
    return { kind: "unchanged" as const, reason: "duplicate" as const, commandId: existing._id };
  }
  const command =
    input.kind === "sendMessage"
      ? { ...input, text: requireMessageText(input.text) }
      : input;
  const runs = await ctx.db
    .query("runs")
    .withIndex("by_job", (q) => q.eq("jobId", job._id))
    .collect();
  const asks = await ctx.db
    .query("asks")
    .withIndex("by_job", (q) => q.eq("jobId", job._id))
    .collect();
  const row = await ctx.db.insert("jobCommands", {
    jobId: job._id,
    commandId,
    command,
  });
  const plan = applyJobCommand(toAggregate(job, runs, asks), command, row);
  await applyJobWrites(ctx, job, plan.writes, row);
  return plan.receipt.kind === "applied"
    ? { kind: "applied" as const, commandId: row }
    : { kind: "unchanged" as const, reason: plan.receipt.reason, commandId: row };
}

export const dispatchCommand = mutation({
  args: {
    jobId: v.id("jobs"),
    commandId: v.string(),
    command: jobCommand,
  },
  returns: commandReceipt,
  handler: async (ctx, args) => {
    return await dispatch(ctx, args.jobId, args.commandId, args.command);
  },
});

export const stop = mutation({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await dispatch(ctx, args.jobId, crypto.randomUUID(), { kind: "stopJob" });
    return null;
  },
});

export const remove = mutation({
  args: { jobId: v.id("jobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const job = await requireJob(ctx, args.jobId);
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
    for (const run of runs) {
      const messages = await ctx.db
        .query("runMessages")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .collect();
      for (const message of messages) await ctx.db.delete(message._id);
    }
    const commands = await ctx.db
      .query("jobCommands")
      .withIndex("by_job", (q) => q.eq("jobId", job._id))
      .collect();
    for (const ask of asks) await ctx.db.delete(ask._id);
    for (const artifact of artifacts) await ctx.db.delete(artifact._id);
    for (const command of commands) await ctx.db.delete(command._id);
    for (const run of runs) await ctx.db.delete(run._id);
    const project = await requireProject(ctx, job.projectId);
    if (job.usage && !isZeroUsage(job.usage)) {
      await ctx.db.patch(project._id, {
        usage: subUsage(project.usage ?? ZERO_USAGE, job.usage),
      });
    }
    await ctx.db.delete(job._id);
    return null;
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
    if (run.status !== "awaitingAsk") {
      throw new Error("This Ask is no longer waiting for an answer");
    }
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
    const next = nextStage(await stagesOfRecipe(ctx, job.recipeId), job.stageKey);
    if (!next) throw new Error("Workflow has no Stage after plan");
    const status = isPrStage(next.key) ? "pr" : "building";
    assertTransition(job.status, status);
    await ctx.db.patch(job._id, {
      status,
      stageKey: next.key,
      acceptedSpec: spec,
    });
    await enqueueStage(ctx, job._id, next.key, job.runtime);
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
  key: string,
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
    const next = nextStage(await stagesOfRecipe(ctx, job.recipeId), job.stageKey);
    if (!next) {
      assertTransition(job.status, "pr");
      await ctx.db.patch(job._id, { status: "pr" });
      return null;
    }
    const status = isPrStage(next.key) ? "pr" : "building";
    assertTransition(job.status, status);
    await ctx.db.patch(job._id, { status, stageKey: next.key });
    await enqueueStage(ctx, job._id, next.key, job.runtime);
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
