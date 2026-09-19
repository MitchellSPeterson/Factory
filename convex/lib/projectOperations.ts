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
  v.object({ kind: v.literal("checkout"), branch: v.string() }),
  v.object({
    kind: v.literal("createBranch"),
    name: v.string(),
    checkout: v.boolean(),
  }),
  v.object({
    kind: v.literal("createWorktree"),
    name: v.string(),
    branch: v.string(),
    createBranch: v.boolean(),
  }),
  v.object({ kind: v.literal("removeWorktree"), path: v.string() }),
  v.object({ kind: v.literal("fetch") }),
  v.object({ kind: v.literal("pull") }),
  v.object({ kind: v.literal("push") }),
  v.object({ kind: v.literal("terminal"), command: v.string() }),
);
export const gitFile = v.object({
  path: v.string(),
  status: v.string(),
  originalPath: v.optional(v.string()),
});
export const gitBranch = v.object({
  name: v.string(),
  current: v.boolean(),
  remote: v.boolean(),
  upstream: v.optional(v.string()),
  ahead: v.number(),
  behind: v.number(),
  gone: v.boolean(),
  worktreePath: v.optional(v.string()),
});
export const gitWorktree = v.object({
  path: v.string(),
  head: v.string(),
  branch: v.optional(v.string()),
  bare: v.boolean(),
  locked: v.boolean(),
  prunable: v.boolean(),
  current: v.boolean(),
});
export const gitCommit = v.object({
  sha: v.string(),
  subject: v.string(),
  author: v.string(),
  committedAt: v.number(),
});
export const operationResult = v.union(
  v.object({
    kind: v.literal("status"),
    branch: v.string(),
    files: v.array(gitFile),
    head: v.optional(v.string()),
    detached: v.optional(v.boolean()),
    upstream: v.optional(v.string()),
    ahead: v.optional(v.number()),
    behind: v.optional(v.number()),
    gone: v.optional(v.boolean()),
    remotes: v.optional(v.array(v.string())),
    branches: v.optional(v.array(gitBranch)),
    worktrees: v.optional(v.array(gitWorktree)),
    commits: v.optional(v.array(gitCommit)),
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
