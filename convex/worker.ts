import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  answeredGrillCount,
  gateOpen,
  latestSpec,
  latestVerdict,
  pendingAskForRun,
  requireJob,
  requireProject,
  requireRun,
  stagesOfRecipe,
} from "./lib/docs";
import {
  applyJobWrites,
  settleRun,
  toAggregate,
  type WorkerResult,
} from "./lib/jobControl";
import { markRunEnded, markRunStarted } from "./lib/runTiming";
import {
  assertTransition,
  laneOf,
  largeAndThinSpec,
  parsePlanVerdict,
  runningLane,
} from "./lib/jobState";
import {
  isPlanStage,
  isPrStage,
  nextStage,
  stageAgent,
  stageHalt,
} from "./lib/recipeGraph";
import {
  answer,
  agentEffort,
  agentProvider,
  agentModel,
  artifactKind,
  askKind,
  askStatus,
  gateName,
  question,
  runStatus,
  runtime,
  stageKey,
  tokenUsage,
  contextBreakdown,
} from "./lib/validators";
import { v } from "convex/values";
import { requireProjectServer } from "./lib/servers";
import {
  addUsage,
  isZeroUsage,
  subUsage,
  ZERO_USAGE,
} from "./lib/tokenUsage";

const skillBinding = v.object({
  slug: v.string(),
  title: v.string(),
  body: v.string(),
  gate: v.optional(gateName),
});

const launchView = v.object({
  provider: v.optional(agentProvider),
  runId: v.id("runs"),
  jobId: v.id("jobs"),
  stageKey: stageKey,
  runtime: runtime,
  grillAttached: v.boolean(),
  request: v.string(),
  acceptedSpec: v.optional(v.string()),
  forceGrill: v.boolean(),
  model: agentModel,
  effort: agentEffort,
  project: v.object({
    id: v.id("projects"),
    serverId: v.optional(v.id("servers")),
    name: v.string(),
    kind: v.union(v.literal("expo"), v.literal("web"), v.literal("mixed")),
    localPath: v.string(),
    githubRepo: v.string(),
  }),
  skills: v.array(skillBinding),
});

export const listQueued = query({
  args: {},
  returns: v.array(v.id("runs")),
  handler: async (ctx) => {
    const runs = await ctx.db
      .query("runs")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();
    return runs.map((r) => r._id);
  },
});

export const claim = mutation({
  args: { runId: v.id("runs"), accessKey: v.optional(v.string()) },
  returns: v.union(launchView, v.null()),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "queued") return null;
    const job = await requireJob(ctx, run.jobId);
    const recipe = await ctx.db.get(job.recipeId);
    if (!recipe) throw new Error("Workflow not found");
    const project = await requireProject(ctx, job.projectId);
    if (project.serverId) {
      if (!args.accessKey) return null;
      try { await requireProjectServer(ctx, project, args.accessKey); } catch { return null; }
      if (project.cloneStatus !== "ready") return null;
    }
    const verdict = await latestVerdict(ctx, job._id);
    const stage = await ctx.db
      .query("stages")
      .withIndex("by_recipe_and_key", (q) =>
        q.eq("recipeId", job.recipeId).eq("key", run.stageKey),
      )
      .unique();
    if (!stage) throw new Error("Stage not found on workflow");
    const bindings = await ctx.db
      .query("bindings")
      .withIndex("by_stage", (q) => q.eq("stageId", stage._id))
      .collect();
    bindings.sort((a, b) => a.order - b.order);
    const profile = stage.agentProfileId ? await ctx.db.get(stage.agentProfileId) : null;
    if (stage.agentProfileId && !profile) throw new Error("Assigned Agent not found");
    const skills = [];
    const included = new Set<string>();
    let grillAttached = run.grillAttached;
    for (const binding of bindings) {
      if (!gateOpen(job.forceGrill, verdict, binding.gate)) continue;
      const skill = await ctx.db.get(binding.skillId);
      if (!skill) continue;
      if (skill.slug === "grilling") grillAttached = true;
      included.add(skill._id);
      skills.push({
        slug: skill.slug,
        title: skill.title,
        body: skill.body,
        gate: binding.gate,
      });
    }
    if (profile) {
      skills.unshift({ slug: "agent-guidance", title: profile.name, body: [profile.description, profile.guidance].filter(Boolean).join("\n\n"), gate: undefined });
      for (const skillId of profile.skillIds) {
        if (included.has(skillId)) continue;
        const skill = await ctx.db.get(skillId);
        if (!skill) throw new Error("Assigned Agent Skill not found");
        included.add(skillId);
        if (skill.slug === "grilling") grillAttached = true;
        skills.push({ slug: skill.slug, title: skill.title, body: skill.body, gate: undefined });
      }
    }
    await markRunStarted(ctx, run);
    await ctx.db.patch(run._id, { status: "running", grillAttached });
    if (laneOf(job.status) === "queued") {
      const nextLane = runningLane(stage);
      assertTransition(job.status, nextLane);
      await ctx.db.patch(job._id, { status: nextLane });
    }
    const agent = stageAgent(stage, profile ?? recipe);
    return {
      runId: run._id,
      jobId: job._id,
      stageKey: run.stageKey,
      runtime: run.runtime,
      grillAttached,
      request: job.request,
      acceptedSpec: job.acceptedSpec,
      forceGrill: job.forceGrill,
      provider: profile?.provider,
      model: agent.model,
      effort: agent.effort,
      project: {
        id: project._id,
        serverId: project.serverId,
        name: project.name,
        kind: project.kind,
        localPath: project.localPath,
        githubRepo: project.githubRepo,
      },
      skills,
    };
  },
});

export const bindAgent = mutation({
  args: {
    runId: v.id("runs"),
    agentId: v.string(),
    cursorRunId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRun(ctx, args.runId);
    await ctx.db.patch(args.runId, {
      agentId: args.agentId,
      cursorRunId: args.cursorRunId,
    });
    return null;
  },
});

export const appendMessage = mutation({
  args: { runId: v.id("runs"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    const last = await ctx.db
      .query("runMessages")
      .withIndex("by_run", (q) => q.eq("runId", run._id))
      .order("desc")
      .first();
    if (last) {
      await ctx.db.patch(last._id, { text: last.text + args.text });
      return null;
    }
    await ctx.db.insert("runMessages", {
      runId: run._id,
      jobId: run.jobId,
      text: args.text,
      createdAt: Date.now(),
    });
    return null;
  },
});

/** Replace a Run's absolute usage and roll the delta into its Job and Project. */
export const recordUsage = mutation({
  args: { runId: v.id("runs"), usage: tokenUsage },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    const next = args.usage;
    const prev = run.usage ?? ZERO_USAGE;
    const delta = subUsage(next, prev);
    if (isZeroUsage(delta) && run.usage) return null;

    await ctx.db.patch(run._id, { usage: next });
    if (isZeroUsage(delta)) return null;

    const job = await requireJob(ctx, run.jobId);
    const jobNext = addUsage(job.usage ?? ZERO_USAGE, delta);
    await ctx.db.patch(job._id, { usage: jobNext });

    const project = await requireProject(ctx, job.projectId);
    const projectNext = addUsage(project.usage ?? ZERO_USAGE, delta);
    await ctx.db.patch(project._id, { usage: projectNext });
    return null;
  },
});

/** Store Factory prompt composition for the Run (estimated segments). */
export const recordContext = mutation({
  args: {
    runId: v.id("runs"),
    breakdown: contextBreakdown,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRun(ctx, args.runId);
    await ctx.db.patch(args.runId, { contextBreakdown: args.breakdown });
    return null;
  },
});

export const openAsk = mutation({
  args: {
    runId: v.id("runs"),
    kind: askKind,
    questions: v.array(question),
  },
  returns: v.id("asks"),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    const existing = await pendingAskForRun(ctx, run._id);
    if (existing) throw new Error("A pending Ask already exists");
    const job = await requireJob(ctx, run.jobId);
    if (isPlanStage(run.stageKey)) {
      assertTransition(job.status, "needsDetail");
      await ctx.db.patch(job._id, { status: "needsDetail" });
    }
    await ctx.db.patch(run._id, { status: "awaitingAsk" });
    return await ctx.db.insert("asks", {
      runId: run._id,
      jobId: job._id,
      kind: args.kind,
      questions: args.questions,
      status: "pending",
    });
  },
});

export const getAsk = query({
  args: { askId: v.id("asks") },
  returns: v.union(
    v.object({
      _id: v.id("asks"),
      status: askStatus,
      answers: v.optional(v.array(answer)),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const ask = await ctx.db.get(args.askId);
    if (!ask) return null;
    return { _id: ask._id, status: ask.status, answers: ask.answers };
  },
});

export const submitArtifact = mutation({
  args: {
    runId: v.id("runs"),
    kind: artifactKind,
    body: v.string(),
  },
  returns: v.object({ grillRequired: v.boolean() }),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    const job = await requireJob(ctx, run.jobId);
    if (args.kind === "plan_verdict") {
      const verdict = parsePlanVerdict(args.body);
      if (!verdict) throw new Error("plan_verdict must be {size, specQuality}");
    }
    await ctx.db.insert("artifacts", {
      jobId: job._id,
      runId: run._id,
      kind: args.kind,
      body: args.body,
    });
    const verdict = await latestVerdict(ctx, job._id);
    const grillRequired =
      isPlanStage(run.stageKey) &&
      largeAndThinSpec(job.forceGrill, verdict) &&
      (await answeredGrillCount(ctx, job._id)) === 0;
    return { grillRequired };
  },
});

/** Late completions must not fail a live Job or advance a settled one. */
async function settle(
  ctx: MutationCtx,
  job: Doc<"jobs">,
  runId: Id<"runs">,
  result: WorkerResult,
): Promise<boolean> {
  const runs = await ctx.db
    .query("runs")
    .withIndex("by_job", (q) => q.eq("jobId", job._id))
    .collect();
  const asks = await ctx.db
    .query("asks")
    .withIndex("by_job", (q) => q.eq("jobId", job._id))
    .collect();
  const plan = settleRun(toAggregate(job, runs, asks), runId, result);
  if (plan.kind === "advance") return true;
  if (plan.kind === "apply") await applyJobWrites(ctx, job, plan.writes);
  return false;
}

export const finishStage = mutation({
  args: {
    runId: v.id("runs"),
    status: v.union(v.literal("finished"), v.literal("failed")),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    const job = await requireJob(ctx, run.jobId);
    const advance = await settle(
      ctx,
      job,
      run._id,
      args.status === "finished"
        ? { kind: "finished" }
        : { kind: "failed", error: args.error ?? "Run failed" },
    );
    if (!advance) return null;

    const stages = await stagesOfRecipe(ctx, job.recipeId);
    const stage = stages.find((s) => s.key === run.stageKey);
    if (!stage) throw new Error("Stage not found on workflow");

    if (isPlanStage(run.stageKey)) {
      const verdict = await latestVerdict(ctx, job._id);
      const spec = await latestSpec(ctx, job._id);
      if (!verdict) throw new Error("Plan needs a plan_verdict artifact");
      if (!spec) throw new Error("Plan needs a spec artifact");
      if (largeAndThinSpec(job.forceGrill, verdict)) {
        const grilled = await answeredGrillCount(ctx, job._id);
        if (grilled === 0) {
          throw new Error("Large thin spec needs a grill Ask before finish");
        }
      }
      assertTransition(job.status, "planReview");
      await ctx.db.patch(run._id, { status: "finished" });
      await markRunEnded(ctx, run);
      await ctx.db.patch(job._id, { status: "planReview", stageKey: run.stageKey });
      return null;
    }

    await ctx.db.patch(run._id, { status: "finished" });
    await markRunEnded(ctx, run);
    if (stageHalt(stage)) {
      assertTransition(job.status, "codeReview");
      await ctx.db.patch(job._id, { status: "codeReview", stageKey: run.stageKey });
      return null;
    }

    const next = nextStage(stages, run.stageKey);
    if (!next) {
      if (laneOf(job.status) !== "pr") assertTransition(job.status, "pr");
      await ctx.db.patch(job._id, { status: "pr", stageKey: run.stageKey });
      return null;
    }
    if (isPrStage(next.key)) {
      if (laneOf(job.status) !== "pr") assertTransition(job.status, "pr");
      await ctx.db.patch(job._id, { status: "pr", stageKey: next.key });
    } else {
      await ctx.db.patch(job._id, { stageKey: next.key });
    }
    await ctx.db.insert("runs", {
      jobId: job._id,
      stageKey: next.key,
      status: "queued",
      runtime: job.runtime,
      grillAttached: false,
    });
    return null;
  },
});

export const failRun = mutation({
  args: { runId: v.id("runs"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    const job = await requireJob(ctx, run.jobId);
    await settle(ctx, job, run._id, { kind: "failed", error: args.error });
    return null;
  },
});

export const takeAgentInput = mutation({
  args: { runId: v.id("runs"), limit: v.number() },
  returns: v.array(v.object({ commandId: v.id("jobCommands"), text: v.string() })),
  handler: async (ctx, args) => {
    const run = await requireRun(ctx, args.runId);
    if (run.status !== "running") return [];
    const taken = await takeStageMessages(
      ctx,
      run.jobId,
      run.stageKey,
      run._id,
      args.limit,
    );
    return taken.map((row) => ({ commandId: row._id, text: row.text }));
  },
});

/** At most once: a taken message is never handed to a second Run. */
async function takeStageMessages(
  ctx: MutationCtx,
  jobId: Id<"jobs">,
  stage: string,
  runId: Id<"runs">,
  limit: number,
): Promise<Array<{ _id: Id<"jobCommands">; text: string }>> {
  const rows = await ctx.db
    .query("jobCommands")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .collect();
  const taken: Array<{ _id: Id<"jobCommands">; text: string }> = [];
  const cap = Math.min(Math.max(Math.trunc(limit), 1), 20);
  for (const row of rows) {
    if (taken.length >= cap) break;
    if (row.command.kind !== "sendMessage") continue;
    if (row.command.stageKey !== stage) continue;
    if (row.delivery?.kind !== "queued") continue;
    await ctx.db.patch(row._id, {
      delivery: { kind: "taken", runId, takenAt: Date.now() },
    });
    taken.push({ _id: row._id, text: row.command.text });
  }
  return taken;
}

export const pendingAsk = query({
  args: { runId: v.id("runs") },
  returns: v.union(
    v.object({
      _id: v.id("asks"),
      status: askStatus,
      answers: v.optional(v.array(answer)),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const ask = await pendingAskForRun(ctx, args.runId);
    if (!ask) return null;
    return { _id: ask._id, status: ask.status, answers: ask.answers };
  },
});

export const answeredAskSince = query({
  args: { runId: v.id("runs") },
  returns: v.union(
    v.object({
      askId: v.id("asks"),
      answers: v.array(answer),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run || run.status !== "running") return null;
    const asks = await ctx.db
      .query("asks")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .collect();
    const answered = asks.filter((a) => a.status === "answered" && a.answers);
    const last = answered[answered.length - 1];
    if (!last || !last.answers) return null;
    return { askId: last._id, answers: last.answers };
  },
});

export const getRunStatus = query({
  args: { runId: v.id("runs") },
  returns: v.union(runStatus, v.null()),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    return run?.status ?? null;
  },
});
