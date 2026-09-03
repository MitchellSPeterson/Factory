import { mutation, query } from "./_generated/server";
import { projectKind, runtime } from "./lib/validators";
import { v } from "convex/values";

const projectDoc = v.object({
  _id: v.id("projects"),
  _creationTime: v.number(),
  name: v.string(),
  kind: projectKind,
  localPath: v.string(),
  githubRepo: v.string(),
  defaultRuntime: runtime,
});

export const list = query({
  args: {},
  returns: v.array(projectDoc),
  handler: async (ctx) => {
    return await ctx.db.query("projects").collect();
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
  },
  returns: v.id("projects"),
  handler: async (ctx, args) => {
    if (args.name.trim() === "") throw new Error("Name is required");
    if (args.localPath.trim() === "") throw new Error("Local path is required");
    return await ctx.db.insert("projects", args);
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    kind: projectKind,
    localPath: v.string(),
    githubRepo: v.string(),
    defaultRuntime: runtime,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    const { projectId, ...fields } = args;
    await ctx.db.patch(projectId, fields);
    return null;
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    await ctx.db.delete(args.projectId);
    return null;
  },
});
