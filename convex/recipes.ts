import { mutation, query } from "./_generated/server";
import { recipeEffort, recipeModel } from "./lib/agentModel";
import { agentEffort, agentModel, gateName, stageKey } from "./lib/validators";
import { v } from "convex/values";

const bindingView = v.object({
  _id: v.id("bindings"),
  skillId: v.id("skills"),
  slug: v.string(),
  title: v.string(),
  gate: v.optional(gateName),
  order: v.number(),
});

const stageView = v.object({
  _id: v.id("stages"),
  key: stageKey,
  order: v.number(),
  title: v.string(),
  bindings: v.array(bindingView),
});

const recipeView = v.object({
  _id: v.id("recipes"),
  name: v.string(),
  slug: v.string(),
  model: agentModel,
  effort: agentEffort,
  stages: v.array(stageView),
});

export const getFeature = query({
  args: {},
  returns: v.union(recipeView, v.null()),
  handler: async (ctx) => {
    const recipe = await ctx.db
      .query("recipes")
      .withIndex("by_slug", (q) => q.eq("slug", "feature"))
      .unique();
    if (!recipe) return null;
    const stages = await ctx.db
      .query("stages")
      .withIndex("by_recipe", (q) => q.eq("recipeId", recipe._id))
      .collect();
    stages.sort((a, b) => a.order - b.order);
    const stageViews = [];
    for (const stage of stages) {
      const bindings = await ctx.db
        .query("bindings")
        .withIndex("by_stage", (q) => q.eq("stageId", stage._id))
        .collect();
      bindings.sort((a, b) => a.order - b.order);
      const bindingViews = [];
      for (const binding of bindings) {
        const skill = await ctx.db.get(binding.skillId);
        if (!skill) continue;
        bindingViews.push({
          _id: binding._id,
          skillId: binding.skillId,
          slug: skill.slug,
          title: skill.title,
          gate: binding.gate,
          order: binding.order,
        });
      }
      stageViews.push({
        _id: stage._id,
        key: stage.key,
        order: stage.order,
        title: stage.title,
        bindings: bindingViews,
      });
    }
    return {
      _id: recipe._id,
      name: recipe.name,
      slug: recipe.slug,
      model: recipeModel(recipe.model),
      effort: recipeEffort(recipe.effort),
      stages: stageViews,
    };
  },
});

export const setAgent = mutation({
  args: {
    recipeId: v.id("recipes"),
    model: v.optional(agentModel),
    effort: v.optional(agentEffort),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) throw new Error("Recipe not found");
    const patch: { model?: string; effort?: typeof args.effort } = {};
    if (args.model !== undefined) {
      if (args.model.trim() === "") throw new Error("Model is required");
      patch.model = args.model.trim();
    }
    if (args.effort !== undefined) patch.effort = args.effort;
    if (patch.model === undefined && patch.effort === undefined) {
      throw new Error("Nothing to update");
    }
    await ctx.db.patch(args.recipeId, patch);
    return null;
  },
});

export const setBindingGate = mutation({
  args: {
    bindingId: v.id("bindings"),
    gate: v.optional(gateName),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const binding = await ctx.db.get(args.bindingId);
    if (!binding) throw new Error("Binding not found");
    await ctx.db.patch(args.bindingId, { gate: args.gate });
    return null;
  },
});

export const addBinding = mutation({
  args: {
    stageId: v.id("stages"),
    skillId: v.id("skills"),
    gate: v.optional(gateName),
  },
  returns: v.id("bindings"),
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId);
    if (!stage) throw new Error("Stage not found");
    const skill = await ctx.db.get(args.skillId);
    if (!skill) throw new Error("Skill not found");
    const existing = await ctx.db
      .query("bindings")
      .withIndex("by_stage", (q) => q.eq("stageId", args.stageId))
      .collect();
    return await ctx.db.insert("bindings", {
      stageId: args.stageId,
      skillId: args.skillId,
      gate: args.gate,
      order: existing.length,
    });
  },
});

export const removeBinding = mutation({
  args: { bindingId: v.id("bindings") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const binding = await ctx.db.get(args.bindingId);
    if (!binding) throw new Error("Binding not found");
    await ctx.db.delete(args.bindingId);
    return null;
  },
});
