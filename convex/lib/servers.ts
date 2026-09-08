import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
export async function requireServer(ctx: QueryCtx | MutationCtx, accessKey: string): Promise<Doc<"servers">> {
  if (!/^[a-f0-9]{64}$/.test(accessKey)) throw new Error("Pair this worker in Settings first.");
  const server = await ctx.db.query("servers").withIndex("by_accessKey", q => q.eq("accessKey", accessKey)).unique();
  if (!server) throw new Error("Worker pairing key is invalid.");
  return server;
}
export async function requireProjectServer(ctx: QueryCtx | MutationCtx, project: Doc<"projects">, accessKey?: string) {
  if (!project.serverId) return;
  const server = await requireServer(ctx, accessKey ?? "");
  if (server._id !== project.serverId) throw new Error("This Project belongs to another worker.");
}
