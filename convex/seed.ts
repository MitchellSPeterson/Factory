import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  DEFAULT_AGENT_EFFORT,
  DEFAULT_AGENT_MODEL,
} from "./lib/agentModel";
import { v } from "convex/values";

const skillInput = v.object({
  slug: v.string(),
  title: v.string(),
  body: v.string(),
  sourceHint: v.string(),
  sourceKind: v.optional(v.literal("factory")),
});

const FEATURE_STAGES = [
  { key: "plan" as const, title: "Plan", order: 0, halt: true },
  { key: "implement" as const, title: "Implement", order: 1, halt: false },
  { key: "verify" as const, title: "Verify", order: 2, halt: true },
  { key: "pr" as const, title: "PR", order: 3, halt: false },
];

const FEATURE_BINDINGS: {
  stageKey: "plan" | "implement" | "verify" | "pr";
  skillSlug: string;
  gate?: "largeAndThinSpec";
  order: number;
}[] = [
  { stageKey: "plan", skillSlug: "factory-plan", order: 0 },
  { stageKey: "plan", skillSlug: "domain-modeling", order: 1 },
  { stageKey: "plan", skillSlug: "grilling", gate: "largeAndThinSpec", order: 2 },
  { stageKey: "implement", skillSlug: "poteto-feature", order: 0 },
  { stageKey: "verify", skillSlug: "verify", order: 0 },
  { stageKey: "pr", skillSlug: "opening-pr", order: 0 },
];

export const ensure = mutation({
  args: { skills: v.array(skillInput) },
  returns: v.object({
    recipeId: v.id("recipes"),
    createdSkills: v.number(),
    createdRecipe: v.boolean(),
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

    const existingRecipe = await ctx.db
      .query("recipes")
      .withIndex("by_slug", (q) => q.eq("slug", "feature"))
      .unique();
    if (existingRecipe) {
      if (existingRecipe.model === undefined || existingRecipe.effort === undefined) {
        await ctx.db.patch(existingRecipe._id, {
          model: existingRecipe.model ?? DEFAULT_AGENT_MODEL,
          effort: existingRecipe.effort ?? DEFAULT_AGENT_EFFORT,
        });
      }
      return {
        recipeId: existingRecipe._id,
        createdSkills,
        createdRecipe: false,
      };
    }

    const recipeId = await ctx.db.insert("recipes", {
      name: "Feature",
      slug: "feature",
      model: DEFAULT_AGENT_MODEL,
      effort: DEFAULT_AGENT_EFFORT,
    });

    const stageIds = new Map<string, Id<"stages">>();
    for (const stage of FEATURE_STAGES) {
      const stageId =       await ctx.db.insert("stages", {
        recipeId,
        key: stage.key,
        order: stage.order,
        title: stage.title,
        halt: stage.halt,
      });
      stageIds.set(stage.key, stageId);
    }

    for (const binding of FEATURE_BINDINGS) {
      const skill = await ctx.db
        .query("skills")
        .withIndex("by_slug", (q) => q.eq("slug", binding.skillSlug))
        .unique();
      const stageId = stageIds.get(binding.stageKey);
      if (!skill || !stageId) {
        throw new Error(`Seed missing ${binding.skillSlug} or ${binding.stageKey}`);
      }
      await ctx.db.insert("bindings", {
        stageId,
        skillId: skill._id,
        gate: binding.gate,
        order: binding.order,
      });
    }

    return { recipeId, createdSkills, createdRecipe: true };
  },
});

export const featureReady = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const recipe = await ctx.db
      .query("recipes")
      .withIndex("by_slug", (q) => q.eq("slug", "feature"))
      .unique();
    return recipe !== null;
  },
});
