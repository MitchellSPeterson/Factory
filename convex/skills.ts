import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const skillDoc = v.object({
  _id: v.id("skills"),
  _creationTime: v.number(),
  slug: v.string(),
  title: v.string(),
  body: v.string(),
  sourceHint: v.string(),
  description: v.optional(v.string()),
  sourceKind: v.optional(
    v.union(v.literal("factory"), v.literal("github"), v.literal("local"), v.literal("pasted")),
  ),
  sourceUrl: v.optional(v.string()),
  sourceRevision: v.optional(v.string()),
  importedAt: v.optional(v.number()),
});

export const list = query({
  args: {},
  returns: v.array(skillDoc),
  handler: async (ctx) => {
    return await ctx.db.query("skills").withIndex("by_slug").take(250);
  },
});

export const create = mutation({
  args: {
    slug: v.string(),
    title: v.string(),
    body: v.string(),
    description: v.optional(v.string()),
    sourceKind: v.union(v.literal("github"), v.literal("local"), v.literal("pasted")),
    sourceHint: v.string(),
    sourceUrl: v.optional(v.string()),
    sourceRevision: v.optional(v.string()),
  },
  returns: v.id("skills"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("skills")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) throw new Error(`A skill with the slug “${args.slug}” already exists`);
    return await ctx.db.insert("skills", { ...args, importedAt: Date.now() });
  },
});

export const get = query({
  args: { skillId: v.id("skills") },
  returns: v.union(skillDoc, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.skillId);
  },
});

export const update = mutation({
  args: {
    skillId: v.id("skills"),
    title: v.string(),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const skill = await ctx.db.get(args.skillId);
    if (!skill) throw new Error("Skill not found");
    await ctx.db.patch(args.skillId, { title: args.title, body: args.body });
    return null;
  },
});
