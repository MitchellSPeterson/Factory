import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireServer } from "./lib/servers";
import { validateRepository, validateVariableName } from "../shared/managed";
import { projectKind } from "./lib/validators";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const serverView = v.object({ id: v.id("servers"), name: v.string(), publicKey: v.string(), projectsRoot: v.string(), lastSeen: v.number() });
export const register = mutation({
  args: { accessKey: v.string(), name: v.string(), publicKey: v.string(), projectsRoot: v.string() }, returns: v.id("servers"),
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.accessKey) || args.name.length > 100 || args.publicKey.length > 4096 || args.projectsRoot.length > 1024) throw new Error("Invalid worker registration.");
    const old = await ctx.db.query("servers").withIndex("by_accessKey", q => q.eq("accessKey", args.accessKey)).unique();
    if (old) {
      if (old.publicKey !== args.publicKey || old.projectsRoot !== args.projectsRoot) throw new Error("Worker identity changed. Restore its identity file.");
      await ctx.db.patch(old._id, { lastSeen: Date.now(), name: args.name }); return old._id;
    }
    return ctx.db.insert("servers", { ...args, lastSeen: Date.now() });
  },
});
export const paired = query({
  args: { accessKey: v.string() }, returns: serverView,
  handler: async (ctx, args) => { const server = await requireServer(ctx, args.accessKey); return { id: server._id, name: server.name, publicKey: server.publicKey, projectsRoot: server.projectsRoot, lastSeen: server.lastSeen }; },
});
export const heartbeat = mutation({
  args: { accessKey: v.string() }, returns: v.null(),
  handler: async (ctx, args) => { const server = await requireServer(ctx, args.accessKey); await ctx.db.patch(server._id, { lastSeen: Date.now() }); return null; },
});
async function checkScope(ctx: Parameters<typeof requireServer>[0], serverId: Id<"servers">, scope: string) {
  if (scope === "server") return;
  const id = ctx.db.normalizeId("projects", scope);
  const project = id ? await ctx.db.get(id) : null;
  if (!project || project.serverId !== serverId) throw new Error("Choose a Project belonging to this worker.");
}
export const variables = query({
  args: { accessKey: v.string(), scope: v.string() }, returns: v.array(v.object({ name: v.string(), updatedAt: v.number() })),
  handler: async (ctx, args) => {
    const server = await requireServer(ctx, args.accessKey); await checkScope(ctx, server._id, args.scope);
    const rows = await ctx.db.query("environment").withIndex("by_serverId_and_scope_and_name", q => q.eq("serverId", server._id).eq("scope", args.scope)).take(100);
    return rows.map(({ name, updatedAt }) => ({ name, updatedAt }));
  },
});
export const setVariable = mutation({
  args: { accessKey: v.string(), scope: v.string(), name: v.string(), sealed: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const server = await requireServer(ctx, args.accessKey); await checkScope(ctx, server._id, args.scope);
    validateVariableName(args.name, args.scope === "server");
    if (args.sealed.length < 100 || args.sealed.length > 30000) throw new Error("Invalid encrypted value.");
    const rows = await ctx.db.query("environment").withIndex("by_serverId_and_scope_and_name", q => q.eq("serverId", server._id).eq("scope", args.scope)).take(100);
    const old = rows.find(row => row.name === args.name);
    if (old) await ctx.db.patch(old._id, { sealed: args.sealed, updatedAt: Date.now() });
    else { if (rows.length >= 100) throw new Error("At most 100 variables per scope."); await ctx.db.insert("environment", { serverId: server._id, scope: args.scope, name: args.name, sealed: args.sealed, updatedAt: Date.now() }); }
    return null;
  },
});
export const removeVariable = mutation({
  args: { accessKey: v.string(), scope: v.string(), name: v.string() }, returns: v.null(),
  handler: async (ctx, args) => { const server = await requireServer(ctx, args.accessKey); await checkScope(ctx, server._id, args.scope); const row = await ctx.db.query("environment").withIndex("by_serverId_and_scope_and_name", q => q.eq("serverId", server._id).eq("scope", args.scope).eq("name", args.name)).unique(); if (row) await ctx.db.delete(row._id); return null; },
});
// External worker endpoint: requires the same unguessable pairing capability.
export const readEnvironment = query({
  args: { accessKey: v.string(), projectId: v.optional(v.id("projects")) }, returns: v.array(v.object({ name: v.string(), sealed: v.string(), scope: v.string() })),
  handler: async (ctx, args) => {
    const server = await requireServer(ctx, args.accessKey);
    if (args.projectId) await checkScope(ctx, server._id, args.projectId);
    const rows = [];
    for (const scope of args.projectId ? ["server", args.projectId] : ["server"]) {
      rows.push(...await ctx.db.query("environment").withIndex("by_serverId_and_scope_and_name", q => q.eq("serverId", server._id).eq("scope", scope)).take(100));
    }
    return rows.map(({ name, sealed, scope }) => ({ name, sealed, scope }));
  },
});
export const importRepository = mutation({
  args: { accessKey: v.string(), repo: v.string(), name: v.string(), kind: projectKind, recipeId: v.optional(v.id("recipes")), sealedToken: v.string() }, returns: v.id("projects"),
  handler: async (ctx, args) => {
    const server = await requireServer(ctx, args.accessKey);
    const repo = validateRepository(args.repo).toLowerCase();
    if (!args.name.trim() || args.name.length > 200 || args.sealedToken.length < 100 || args.sealedToken.length > 30000) throw new Error("Invalid import request.");
    if (args.recipeId && !await ctx.db.get(args.recipeId)) throw new Error("Workflow not found.");
    const existing = await ctx.db.query("projects").withIndex("by_serverId_and_githubRepo", q => q.eq("serverId", server._id).eq("githubRepo", repo)).unique();
    if (existing) throw new Error("This repository is already a Project on this worker.");
    const projectId = await ctx.db.insert("projects", { name: args.name.trim(), githubRepo: repo, kind: args.kind, defaultRuntime: "local", localPath: "", serverId: server._id, cloneStatus: "queued", recipeId: args.recipeId });
    await ctx.db.insert("projectImports", { projectId, serverId: server._id, repo, sealedToken: args.sealedToken, status: "queued", leaseUntil: 0, attempt: 0 });
    return projectId;
  },
});
export const retryImport = mutation({
  args: { accessKey: v.string(), projectId: v.id("projects"), sealedToken: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const server = await requireServer(ctx, args.accessKey); await checkScope(ctx, server._id, args.projectId);
    const row = await ctx.db.query("projectImports").withIndex("by_projectId", q => q.eq("projectId", args.projectId)).unique();
    if (!row || row.status !== "failed" || args.sealedToken.length < 100 || args.sealedToken.length > 30000) throw new Error("This import cannot be retried.");
    await ctx.db.patch(row._id, { status: "queued", sealedToken: args.sealedToken, leaseUntil: 0 });
    await ctx.db.patch(args.projectId, { cloneStatus: "queued", cloneError: undefined }); return null;
  },
});
export const claimImport = mutation({
  args: { accessKey: v.string() }, returns: v.union(schema.doc("projectImports"), v.null()),
  handler: async (ctx, args) => {
    const server = await requireServer(ctx, args.accessKey);
    const active = await ctx.db.query("projectImports").withIndex("by_serverId_and_status", q => q.eq("serverId", server._id).eq("status", "cloning")).first();
    if (active && active.leaseUntil > Date.now()) return null;
    const row = active ?? await ctx.db.query("projectImports").withIndex("by_serverId_and_status", q => q.eq("serverId", server._id).eq("status", "queued")).first();
    if (!row) return null;
    if (!await ctx.db.get(row.projectId)) { await ctx.db.delete(row._id); return null; }
    const changes = { status: "cloning" as const, leaseUntil: Date.now() + 12 * 60_000, attempt: row.attempt + 1 };
    await ctx.db.patch(row._id, changes); await ctx.db.patch(row.projectId, { cloneStatus: "cloning", cloneError: undefined });
    return { ...row, ...changes };
  },
});
export const finishImport = mutation({
  args: { accessKey: v.string(), importId: v.id("projectImports"), attempt: v.number(), localPath: v.optional(v.string()), error: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const server = await requireServer(ctx, args.accessKey); const row = await ctx.db.get(args.importId);
    if (!row || row.serverId !== server._id) throw new Error("Import not found.");
    if (row.status !== "cloning" || row.attempt !== args.attempt) return null;
    if (!args.error && !args.localPath) throw new Error("Clone path is required.");
    const status = args.error ? "failed" as const : "ready" as const;
    await ctx.db.patch(row._id, { status, sealedToken: undefined, leaseUntil: 0 });
    if (await ctx.db.get(row.projectId)) await ctx.db.patch(row.projectId, { cloneStatus: status, cloneError: args.error?.slice(0, 500), ...(args.localPath ? { localPath: args.localPath } : {}) });
    return null;
  },
});
