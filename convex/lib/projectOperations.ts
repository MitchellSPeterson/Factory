import { v } from "convex/values";

export const projectOperation = v.union(
  v.object({ kind: v.literal("status") }),
  v.object({ kind: v.literal("diff"), path: v.string() }),
  v.object({
    kind: v.literal("commit"),
    message: v.string(),
    expectedBranch: v.optional(v.string()),
    paths: v.array(v.string()),
  }),
  v.object({ kind: v.literal("terminal"), command: v.string() }),
);
export const gitFile = v.object({
  path: v.string(),
  status: v.string(),
  originalPath: v.optional(v.string()),
});
export const operationResult = v.union(
  v.object({
    kind: v.literal("status"),
    branch: v.string(),
    files: v.array(gitFile),
  }),
  v.object({ kind: v.literal("text"), text: v.string(), exitCode: v.number() }),
);
export const operationState = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("done"),
  v.literal("failed"),
  v.literal("cancelled"),
);
