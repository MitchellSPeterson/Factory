import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

export async function requireServer(ctx: QueryCtx | MutationCtx, accessKey: string): Promise<Doc<"servers">> {
  if (!/^[a-f0-9]{64}$/.test(accessKey)) throw new Error("Worker identity is invalid.");
  const server = await ctx.db.query("servers").withIndex("by_accessKey", q => q.eq("accessKey", accessKey)).unique();
  if (!server) throw new Error("Worker identity is invalid.");
  return server;
}

export async function localServer(ctx: QueryCtx | MutationCtx): Promise<Doc<"servers"> | null> {
  return await ctx.db.query("servers").withIndex("by_lastSeen").order("desc").first() ?? null;
}

export async function resolveServer(ctx: QueryCtx | MutationCtx, accessKey?: string): Promise<Doc<"servers">> {
  if (accessKey) return requireServer(ctx, accessKey);
  const server = await localServer(ctx);
  if (!server) throw new Error("This machine is offline. Start the worker.");
  return server;
}

export async function requireProjectServer(ctx: QueryCtx | MutationCtx, project: Doc<"projects">, accessKey?: string) {
  if (!project.serverId) return;
  const server = await resolveServer(ctx, accessKey);
  if (server._id !== project.serverId) throw new Error("This Project belongs to another worker.");
}
