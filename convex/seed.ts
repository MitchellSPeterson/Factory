import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const skillInput = v.object({
  slug: v.string(),
  title: v.string(),
  body: v.string(),
  sourceHint: v.string(),
  sourceKind: v.optional(v.literal("factory")),
});

export const ensure = mutation({
  args: { skills: v.array(skillInput) },
  returns: v.object({
    createdSkills: v.number(),
  }),
  handler: async (ctx, args) => {
    let createdSkills = 0;
    for (const skill of args.skills) {
      const existing = await ctx.db
        .query("skills")
        .withIndex("by_slug", (q) => q.eq("slug", skill.slug))
        .unique();
      if (existing) continue;
      await ctx.db.insert("skills", skill);
      createdSkills += 1;
    }
    return { createdSkills };
  },
});

export const featureReady = query({
  args: {},
  returns: v.boolean(),
  handler: async () => true,
});
