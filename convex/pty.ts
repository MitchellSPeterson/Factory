import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireProject } from "./lib/docs";
import { requireServer, resolveServer } from "./lib/servers";

const ONLINE_MS = 45_000;
const TICKET_TTL_MS = 120_000;

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const issueTicket = mutation({
  args: { projectId: v.id("projects") },
  returns: v.object({
    wsUrl: v.string(),
    ticket: v.string(),
    expiresAt: v.number(),
    hostOs: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const project = await requireProject(ctx, args.projectId);
    const server = project.serverId
      ? await ctx.db.get(project.serverId)
      : await resolveServer(ctx);
    if (!server || Date.now() - server.lastSeen > ONLINE_MS)
      throw new Error("This machine is offline. Start the worker and retry.");
    if (!server.pty?.url)
      throw new Error("Terminal is not available on this worker.");
    const ticket = randomToken();
    const expiresAt = Date.now() + TICKET_TTL_MS;
    await ctx.db.insert("ptyTickets", {
      token: ticket,
      projectId: project._id,
      serverId: server._id,
      expiresAt,
    });
    return {
      wsUrl: server.pty.url,
      ticket,
      expiresAt,
      hostOs: server.pty.os,
    };
  },
});

export const validateTicket = mutation({
  args: { accessKey: v.string(), ticket: v.string() },
  returns: v.object({ projectId: v.id("projects"), cwd: v.string() }),
  handler: async (ctx, args) => {
    const server = await requireServer(ctx, args.accessKey);
    const row = await ctx.db
      .query("ptyTickets")
      .withIndex("by_token", (q) => q.eq("token", args.ticket))
      .unique();
    if (!row || row.serverId !== server._id)
      throw new Error("Invalid ticket.");
    if (row.expiresAt <= Date.now()) throw new Error("Terminal ticket expired.");
    const project = await requireProject(ctx, row.projectId);
    return { projectId: project._id, cwd: project.localPath };
  },
});

export const reportPty = mutation({
  args: { accessKey: v.string(), url: v.string(), os: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const server = await requireServer(ctx, args.accessKey);
    await ctx.db.patch(server._id, {
      pty: { url: args.url, os: args.os, checkedAt: Date.now() },
      lastSeen: Date.now(),
    });
    return null;
  },
});
