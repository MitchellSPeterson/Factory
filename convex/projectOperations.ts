import { type Infer, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProject } from "./lib/docs";
import { requireServer, resolveServer } from "./lib/servers";
import { operationResult, projectOperation } from "./lib/projectOperations";
import schema from "./schema";

type OperationKind = Infer<typeof projectOperation>["kind"];

const document = schema.tables.projectOperations.validator;
const view = v.object({
  ...document.fields,
  _id: v.id("projectOperations"),
  _creationTime: v.number(),
});
export const list = query({
  args: { projectId: v.id("projects") },
  returns: v.array(view),
  handler: (ctx, args) =>
    ctx.db
      .query("projectOperations")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .order("desc")
      .take(50),
});
export const enqueue = mutation({
  args: { projectId: v.id("projects"), operation: projectOperation },
  returns: v.id("projectOperations"),
  handler: async (ctx, { projectId, operation }) => {
    const project = await requireProject(ctx, projectId);
    const server = project.serverId
      ? await ctx.db.get(project.serverId)
      : await resolveServer(ctx);
    if (!server || Date.now() - server.lastSeen > 45_000)
      throw new Error("This machine is offline. Start the worker and retry.");
    if (project.cloneStatus && project.cloneStatus !== "ready")
      throw new Error("Wait for this Project to finish cloning.");
    if (
      operation.kind === "terminal" &&
      (!operation.command.trim() || operation.command.length > 8000)
    )
      throw new Error("Enter a command of up to 8,000 characters.");
    if (
      operation.kind === "commit" &&
      (!operation.message.trim() ||
        operation.message.length > 2000 ||
        !operation.paths.length ||
        operation.paths.length > 500)
    )
      throw new Error("Select files and enter a commit message.");
    if (
      operation.kind === "checkout" &&
      (!operation.branch.trim() || operation.branch.length > 255)
    )
      throw new Error("Enter a branch name.");
    if (
      operation.kind === "createBranch" &&
      (!operation.name.trim() || operation.name.length > 255)
    )
      throw new Error("Enter a branch name.");
    if (
      operation.kind === "createWorktree" &&
      (!operation.name.trim() ||
        operation.name.length > 80 ||
        !operation.branch.trim() ||
        operation.branch.length > 255)
    )
      throw new Error("Enter a worktree name and branch.");
    if (
      operation.kind === "removeWorktree" &&
      (!operation.path.trim() || operation.path.length > 1024)
    )
      throw new Error("Choose a worktree to remove.");
    const recent = await ctx.db
      .query("projectOperations")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .order("desc")
      .take(100);
    const active = recent.filter(
      (row) => row.state === "queued" || row.state === "running",
    );
    if (operation.kind === "status") {
      const existing = active.find((row) => row.operation.kind === "status");
      if (existing) return existing._id;
    }
    if (active.length >= 10)
      throw new Error("Wait for the pending commands to finish.");
    const blocksAgent =
      operation.kind === "commit" ||
      operation.kind === "checkout" ||
      operation.kind === "pull" ||
      (operation.kind === "createBranch" && operation.checkout);
    if (blocksAgent) {
      const sessions = await ctx.db
        .query("sessions")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .take(100);
      if (sessions.some((s) => s.status === "running" || s.status === "queued")) {
        if (operation.kind === "commit")
          throw new Error("Stop the agent before committing its changes.");
        if (operation.kind === "pull")
          throw new Error("Stop the agent before pulling.");
        throw new Error("Stop the agent before switching branches.");
      }
    }
    const keep: Record<OperationKind, number> = {
      status: 2,
      diff: 5,
      terminal: 20,
      commit: 10,
      checkout: 8,
      createBranch: 8,
      createWorktree: 8,
      removeWorktree: 8,
      fetch: 5,
      pull: 5,
      push: 5,
    };
    for (const row of recent) {
      if (row.state === "queued" || row.state === "running") continue;
      if (keep[row.operation.kind]-- <= 0) await ctx.db.delete(row._id);
    }
    return ctx.db.insert("projectOperations", {
      projectId,
      serverId: server._id,
      operation,
      state: "queued",
      output: "",
    });
  },
});
export const cancel = mutation({
  args: { id: v.id("projectOperations") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (row && (row.state === "queued" || row.state === "running"))
      await ctx.db.patch(id, { state: "cancelled" });
    return null;
  },
});
export const claim = mutation({
  args: { accessKey: v.string() },
  returns: v.union(
    v.object({ ...view.fields, localPath: v.string() }),
    v.null(),
  ),
  handler: async (ctx, { accessKey }) => {
    const server = await requireServer(ctx, accessKey);
    const running = await ctx.db
      .query("projectOperations")
      .withIndex("by_serverId_and_state", (q) =>
        q.eq("serverId", server._id).eq("state", "running"),
      )
      .take(20);
    for (const row of running) {
      if (Date.now() - (row.startedAt ?? 0) > 180_000)
        await ctx.db.patch(row._id, {
          state: "failed",
          error:
            "Worker disconnected or command timed out. Check the result before retrying.",
        });
    }
    const queued = await ctx.db
      .query("projectOperations")
      .withIndex("by_serverId_and_state", (q) =>
        q.eq("serverId", server._id).eq("state", "queued"),
      )
      .take(20);
    for (const item of queued) {
      if (Date.now() - item._creationTime > 180_000)
        await ctx.db.patch(item._id, {
          state: "failed",
          error:
            "Command expired while waiting for the worker. Retry when this machine is online.",
        });
    }
    const row = queued.find(
      (item) =>
        Date.now() - item._creationTime <= 180_000 &&
        !running.some((active) => active.projectId === item.projectId),
    );
    if (!row) return null;
    const project = await ctx.db.get(row.projectId);
    if (!project || (project.serverId && project.serverId !== server._id)) {
      await ctx.db.patch(row._id, {
        state: "failed",
        error: "Project is unavailable on this machine.",
      });
      return null;
    }
    await ctx.db.patch(row._id, { state: "running", startedAt: Date.now() });
    return { ...row, localPath: project.localPath };
  },
});
export const update = mutation({
  args: {
    accessKey: v.string(),
    id: v.id("projectOperations"),
    output: v.string(),
    result: v.optional(operationResult),
    error: v.optional(v.string()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const server = await requireServer(ctx, args.accessKey);
    const row = await ctx.db.get(args.id);
    if (!row || row.serverId !== server._id)
      throw new Error("Unknown command.");
    if (row.state !== "running") return false;
    await ctx.db.patch(row._id, {
      output: args.output.slice(-100_000),
      ...(args.result ? { result: args.result, state: "done" as const } : {}),
      ...(args.error
        ? { error: args.error.slice(0, 2000), state: "failed" as const }
        : {}),
    });
    return true;
  },
});
