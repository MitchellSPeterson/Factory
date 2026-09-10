import { v } from "convex/values";

export const projectKind = v.union(
  v.literal("expo"),
  v.literal("web"),
  v.literal("mixed"),
);

export const runtime = v.union(v.literal("local"), v.literal("cloud"));

export const agentProvider = v.union(v.literal("cursor"), v.literal("codex"), v.literal("grok"), v.literal("openai"));

export const agentModel = v.string();

export const agentEffort = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("xhigh"),
  v.literal("max"),
  v.literal("ultra"),
);

export const stageKey = v.string();

/** Optional board Lane while a Stage runs. Halt / Ask lanes stay engine-driven. */
export const stageLane = v.union(
  v.literal("planning"),
  v.literal("building"),
  v.literal("pr"),
);

export const gateName = v.literal("largeAndThinSpec");

export const jobStatus = v.union(
  v.literal("queued"),
  v.literal("needsDetail"),
  v.literal("planning"),
  v.literal("planReview"),
  v.literal("building"),
  v.literal("codeReview"),
  v.literal("pr"),
  v.literal("failed"),
  v.literal("awaitingAsk"),
  v.literal("awaitingSpec"),
  v.literal("implementing"),
  v.literal("verifying"),
  v.literal("openingPr"),
  v.literal("done"),
);

export const runStatus = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("awaitingAsk"),
  v.literal("finished"),
  v.literal("failed"),
);

export const artifactKind = v.union(
  v.literal("plan_verdict"),
  v.literal("spec"),
  v.literal("pr_url"),
);

export const askStatus = v.union(
  v.literal("pending"),
  v.literal("answered"),
  v.literal("cancelled"),
);

export const jobCommand = v.union(
  v.object({ kind: v.literal("stopJob") }),
  v.object({ kind: v.literal("finishJob") }),
  v.object({
    kind: v.literal("stopStage"),
    stageKey: stageKey,
    expectedRunId: v.id("runs"),
  }),
  v.object({
    kind: v.literal("retryStage"),
    stageKey: stageKey,
    expectedStoppedRunId: v.id("runs"),
  }),
  v.object({
    kind: v.literal("sendMessage"),
    stageKey: stageKey,
    text: v.string(),
  }),
);

export const jobCommandKind = v.union(
  v.literal("stopJob"),
  v.literal("finishJob"),
  v.literal("stopStage"),
  v.literal("retryStage"),
  v.literal("sendMessage"),
);

export const messageDelivery = v.union(
  v.object({ kind: v.literal("queued") }),
  v.object({
    kind: v.literal("taken"),
    runId: v.id("runs"),
    takenAt: v.number(),
  }),
  v.object({ kind: v.literal("transcriptOnly"), reason: v.string() }),
);

export const chatDelivery = v.union(
  v.literal("pollBetweenTurns"),
  v.literal("nextRun"),
  v.literal("transcriptOnly"),
);

export const jobActivity = v.union(
  v.literal("working"),
  v.literal("waitingOnHuman"),
  v.literal("parked"),
  v.literal("done"),
  v.literal("failed"),
);

export const unchangedReason = v.union(
  v.literal("duplicate"),
  v.literal("alreadyTerminal"),
  v.literal("alreadyStopped"),
  v.literal("superseded"),
);

export const askKind = v.union(
  v.literal("grill"),
  v.literal("generic"),
);

export const size = v.union(v.literal("small"), v.literal("large"));

export const specQuality = v.union(v.literal("thin"), v.literal("enough"));

export const question = v.object({
  id: v.string(),
  title: v.string(),
  body: v.string(),
  recommend: v.string(),
});

export const answer = v.object({
  id: v.string(),
  text: v.string(),
});

/** Absolute token counts for a Run, Job, or Project. */
export const tokenUsage = v.object({
  inputTokens: v.number(),
  outputTokens: v.number(),
  cacheReadTokens: v.number(),
  cacheWriteTokens: v.number(),
  reasoningTokens: v.number(),
  totalTokens: v.number(),
});

/** Estimated Factory prompt composition for a Run (not the full model window). */
export const contextSegment = v.object({
  key: v.string(),
  label: v.string(),
  tokens: v.number(),
});

export const contextBreakdown = v.object({
  estimated: v.boolean(),
  segments: v.array(contextSegment),
});
