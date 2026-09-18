import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireProject } from "./lib/docs";
import { requireServer, resolveServer } from "./lib/servers";
import schema from "./schema";

const terminal = v.object({
  ...schema.tables.terminals.validator.fields,
  _id: v.id("terminals"),
  _creationTime: v.number(),
});
const identity = { accessKey: v.string(), owner: v.string() };
const dimensions = { cols: v.number(), rows: v.number() };
function size(cols: number, rows: number) {
  if (
    !Number.isInteger(cols) ||
    !Number.isInteger(rows) ||
    cols < 2 ||
    cols > 500 ||
    rows < 1 ||
    rows > 200
  )
    throw new Error("Invalid terminal size.");
}
export const list = query({
  args: { projectId: v.id("projects") },
  returns: v.array(terminal),
  handler: (ctx, { projectId }) =>
    ctx.db
      .query("terminals")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .take(20),
});
export const output = query({
  args: { id: v.id("terminals") },
  returns: v.union(
    v.object({ output: v.string(), outputEnd: v.number() }),
    v.null(),
  ),
  handler: async (ctx, { id }) => {
    const io = await ctx.db
      .query("terminalIO")
      .withIndex("by_terminalId", (q) => q.eq("terminalId", id))
      .unique();
    return io ? { output: io.output, outputEnd: io.outputEnd } : null;
  },
});
export const create = mutation({
  args: { projectId: v.id("projects") },
  returns: v.id("terminals"),
  handler: async (ctx, { projectId }) => {
    const project = await requireProject(ctx, projectId);
    const server = project.serverId
      ? await ctx.db.get(project.serverId)
      : await resolveServer(ctx);
    if (!server || Date.now() - server.lastSeen > 45_000)
      throw new Error("This machine is offline. Start the worker and retry.");
    if (project.cloneStatus && project.cloneStatus !== "ready")
      throw new Error("Wait for this Project to finish cloning.");
    const tabs = await ctx.db
      .query("terminals")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .take(20);
    if (tabs.length >= 20)
      throw new Error(
        "Close a terminal before opening another. Each Project can have 20 tabs.",
      );
    let number = 1;
    while (tabs.some((t) => t.title === `Terminal ${number}`)) number++;
    const id = await ctx.db.insert("terminals", {
      projectId,
      serverId: server._id,
      title: `Terminal ${number}`,
      state: "queued",
      leaseUntil: 0,
      cols: 80,
      rows: 24,
    });
    await ctx.db.insert("terminalIO", {
      terminalId: id,
      input: "",
      inputEnd: 0,
      output: "",
      outputEnd: 0,
    });
    return id;
  },
});
export const close = mutation({
  args: { id: v.id("terminals") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const io = await ctx.db
      .query("terminalIO")
      .withIndex("by_terminalId", (q) => q.eq("terminalId", id))
      .unique();
    if (io) await ctx.db.delete(io._id);
    if (await ctx.db.get(id)) await ctx.db.delete(id);
    return null;
  },
});
export const input = mutation({
  args: { id: v.id("terminals"), data: v.string() },
  returns: v.null(),
  handler: async (ctx, { id, data }) => {
    const tab = await ctx.db.get(id);
    if (!tab || tab.state !== "running" || tab.leaseUntil < Date.now())
      throw new Error("Terminal is disconnected. Input was not sent.");
    const io = await ctx.db
      .query("terminalIO")
      .withIndex("by_terminalId", (q) => q.eq("terminalId", id))
      .unique();
    if (!io) throw new Error("Terminal was closed.");
    if (io.input.length + data.length > 16_384)
      throw new Error("Terminal input is full. Wait before pasting more text.");
    await ctx.db.patch(io._id, {
      input: io.input + data,
      inputEnd: io.inputEnd + data.length,
    });
    return null;
  },
});
export const resize = mutation({
  args: { id: v.id("terminals"), ...dimensions },
  returns: v.null(),
  handler: async (ctx, { id, cols, rows }) => {
    size(cols, rows);
    const tab = await ctx.db.get(id);
    if (tab && (tab.cols !== cols || tab.rows !== rows))
      await ctx.db.patch(id, { cols, rows });
    return null;
  },
});
export const claim = mutation({
  args: identity,
  returns: v.array(v.object({ ...terminal.fields, localPath: v.string() })),
  handler: async (ctx, { accessKey, owner }) => {
    const server = await requireServer(ctx, accessKey);
    const running = await ctx.db
      .query("terminals")
      .withIndex("by_serverId_and_state", (q) =>
        q.eq("serverId", server._id).eq("state", "running"),
      )
      .take(100);
    for (const tab of running) {
      if (tab.leaseUntil < Date.now())
        await ctx.db.patch(tab._id, {
          state: "exited",
          message:
            "Worker disconnected. Open a new terminal to start another shell.",
        });
    }
    const queued = await ctx.db
      .query("terminals")
      .withIndex("by_serverId_and_state", (q) =>
        q.eq("serverId", server._id).eq("state", "queued"),
      )
      .take(Math.max(0, 100 - running.length));
    const result = [];
    for (const tab of queued) {
      const project = await ctx.db.get(tab.projectId);
      if (!project || (project.serverId && project.serverId !== server._id)) {
        await ctx.db.patch(tab._id, {
          state: "exited",
          message: "Project is unavailable on this machine.",
        });
        continue;
      }
      await ctx.db.patch(tab._id, {
        state: "running",
        owner,
        leaseUntil: Date.now() + 15_000,
      });
      result.push({ ...tab, localPath: project.localPath });
    }
    // Returning owned claims also recovers from a lost response without spawning twice.
    for (const tab of running) {
      if (tab.owner !== owner || tab.leaseUntil < Date.now()) continue;
      const project = await ctx.db.get(tab.projectId);
      if (project && (!project.serverId || project.serverId === server._id))
        result.push({ ...tab, localPath: project.localPath });
    }
    return result;
  },
});
export const exchange = mutation({
  args: {
    ...identity,
    id: v.id("terminals"),
    inputAck: v.number(),
    output: v.string(),
    outputEnd: v.number(),
    exit: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ input: v.string(), inputEnd: v.number(), ...dimensions }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const server = await requireServer(ctx, args.accessKey);
    const tab = await ctx.db.get(args.id);
    if (
      !tab ||
      tab.serverId !== server._id ||
      tab.owner !== args.owner ||
      tab.state !== "running" ||
      tab.leaseUntil < Date.now()
    )
      return null;
    const io = await ctx.db
      .query("terminalIO")
      .withIndex("by_terminalId", (q) => q.eq("terminalId", args.id))
      .unique();
    if (!io) return null;
    if (
      !Number.isSafeInteger(args.inputAck) ||
      args.inputAck < 0 ||
      args.inputAck > io.inputEnd ||
      !Number.isSafeInteger(args.outputEnd) ||
      args.outputEnd < args.output.length ||
      args.output.length > 65_536
    )
      throw new Error("Invalid terminal stream offset.");
    const input = io.input.slice(
      Math.max(0, args.inputAck - (io.inputEnd - io.input.length)),
    );
    if (input !== io.input || args.outputEnd > io.outputEnd)
      await ctx.db.patch(io._id, {
        input,
        ...(args.outputEnd > io.outputEnd
          ? { output: args.output, outputEnd: args.outputEnd }
          : {}),
      });
    if (args.exit !== undefined)
      await ctx.db.patch(tab._id, {
        state: "exited",
        message: args.exit.slice(0, 1000),
      });
    else if (tab.leaseUntil < Date.now() + 10_000)
      await ctx.db.patch(tab._id, { leaseUntil: Date.now() + 15_000 });
    return { input, inputEnd: io.inputEnd, cols: tab.cols, rows: tab.rows };
  },
});
