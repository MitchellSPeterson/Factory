import { mutation, query } from "./_generated/server";
import { projectKind, runtime } from "./lib/validators";
import { v } from "convex/values";

import schema from "./schema";
import { requireProjectServer } from "./lib/servers";

const projectDoc = schema.doc("projects");

export const list = query({
  args: {},
  returns: v.array(projectDoc),
  handler: async (ctx) => {
    return await ctx.db.query("projects").withIndex("by_name").take(500);
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  returns: v.union(projectDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    kind: projectKind,
    localPath: v.string(),
    githubRepo: v.string(),
    defaultRuntime: runtime,
    recipeId: v.optional(v.id("recipes")),
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    if (args.name.trim() === "") throw new Error("Name is required");
    if (args.localPath.trim() === "") throw new Error("Local path is required");
    if (args.recipeId) {
      const recipe = await ctx.db.get(args.recipeId);
      if (!recipe) throw new Error("Workflow not found");
    }
    return await ctx.db.insert("projects", args);
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    accessKey: v.optional(v.string()),
    name: v.string(),
    kind: projectKind,
    localPath: v.string(),
    githubRepo: v.string(),
    defaultRuntime: runtime,
    recipeId: v.optional(v.id("recipes")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (args.recipeId) {
      const recipe = await ctx.db.get(args.recipeId);
      if (!recipe) throw new Error("Workflow not found");
    }
    await requireProjectServer(ctx, project, args.accessKey);
    if (project.serverId && (args.localPath !== project.localPath || args.githubRepo !== project.githubRepo)) throw new Error("Managed repository paths cannot be changed. Import another repository instead.");
    const { projectId, accessKey: _accessKey, ...fields } = args;
    await ctx.db.patch(projectId, fields);
    return null;
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects"), accessKey: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    await requireProjectServer(ctx, project, args.accessKey);
    if (project.cloneStatus === "cloning") throw new Error("Wait for cloning to finish before removing this Project.");
    const imports = await ctx.db.query("projectImports").withIndex("by_projectId", q => q.eq("projectId", args.projectId)).take(10);
    for (const row of imports) await ctx.db.delete(row._id);
    if (project.serverId) {
      const variables = await ctx.db.query("environment").withIndex("by_serverId_and_scope_and_name", q => q.eq("serverId", project.serverId!).eq("scope", project._id)).take(100);
      for (const row of variables) await ctx.db.delete(row._id);
    }
    await ctx.db.delete(args.projectId);
    return null;
  },
});
