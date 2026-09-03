import { v } from "convex/values";

export const projectKind = v.union(
  v.literal("expo"),
  v.literal("web"),
  v.literal("mixed"),
);

export const runtime = v.union(v.literal("local"), v.literal("cloud"));

export const agentModel = v.string();

export const agentEffort = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("xhigh"),
);

export const stageKey = v.union(
  v.literal("plan"),
  v.literal("implement"),
  v.literal("verify"),
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

export const askStatus = v.union(v.literal("pending"), v.literal("answered"));

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
