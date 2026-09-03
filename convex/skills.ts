import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const skillDoc = v.object({
  _id: v.id("skills"),
  _creationTime: v.number(),
  slug: v.string(),
  title: v.string(),
  body: v.string(),
  sourceHint: v.string(),
});

export const list = query({
  args: {},
  returns: v.array(skillDoc),
  handler: async (ctx) => {
    return await ctx.db.query("skills").collect();
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
