import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { recipeEffort, recipeModel } from "./lib/agentModel";
import { stagesOfRecipe } from "./lib/docs";
import { parseStageKey, placeStage, uniqueKey } from "./lib/recipeGraph";
import { agentEffort, agentModel, gateName, stageKey, stageLane } from "./lib/validators";
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
  model: v.optional(v.string()),
  effort: v.optional(v.string()),
  halt: v.boolean(),
  lane: v.optional(stageLane),
  bindings: v.array(bindingView),
});

const recipeView = v.object({
  _id: v.id("recipes"),
  name: v.string(),
  slug: v.string(),
  model: agentModel,
  effort: agentEffort,
  requestTemplate: v.optional(v.string()),
  stages: v.array(stageView),
});

const recipeListItem = v.object({
  _id: v.id("recipes"),
  name: v.string(),
  slug: v.string(),
  model: agentModel,
  effort: agentEffort,
  requestTemplate: v.optional(v.string()),
  stages: v.array(
    v.object({
      _id: v.id("stages"),
      key: stageKey,
      title: v.string(),
      order: v.number(),
    }),
  ),
});

async function bindingsOfStage(ctx: QueryCtx | MutationCtx, stageId: Id<"stages">) {
  const bindings = await ctx.db
    .query("bindings")
    .withIndex("by_stage", (q) => q.eq("stageId", stageId))
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
  return bindingViews;
}

function haltOf(stage: Doc<"stages">): boolean {
  if (stage.halt !== undefined) return stage.halt;
  return stage.key === "plan" || stage.key === "verify";
}

async function toRecipeView(
  ctx: QueryCtx | MutationCtx,
  recipe: Doc<"recipes">,
) {
  const stages = await stagesOfRecipe(ctx, recipe._id);
  const stageViews = [];
  for (const stage of stages) {
    stageViews.push({
      _id: stage._id,
      key: stage.key,
      order: stage.order,
      title: stage.title,
      model: stage.model,
      effort: stage.effort,
      halt: haltOf(stage),
      lane: stage.lane,
      bindings: await bindingsOfStage(ctx, stage._id),
    });
  }
  return {
    _id: recipe._id,
    name: recipe.name,
    slug: recipe.slug,
    model: recipeModel(recipe.model),
    effort: recipeEffort(recipe.effort),
    requestTemplate: recipe.requestTemplate,
    stages: stageViews,
  };
}

async function requireRecipe(
  ctx: QueryCtx | MutationCtx,
  recipeId: Id<"recipes">,
) {
  const recipe = await ctx.db.get(recipeId);
  if (!recipe) throw new Error("Workflow not found");
  return recipe;
}

async function uniqueSlug(
  ctx: MutationCtx,
  raw: string,
  except?: Id<"recipes">,
): Promise<string> {
  let seed = raw;
  try {
    parseStageKey(seed);
  } catch {
    seed = `r-${raw}`;
  }
  const taken: string[] = [];
  const all = await ctx.db.query("recipes").collect();
  for (const row of all) {
    if (except && row._id === except) continue;
    taken.push(row.slug);
  }
  return uniqueKey(taken, seed);
}

async function copyStages(
  ctx: MutationCtx,
  fromRecipeId: Id<"recipes">,
  toRecipeId: Id<"recipes">,
) {
  const stages = await stagesOfRecipe(ctx, fromRecipeId);
  for (const stage of stages) {
    const stageId = await ctx.db.insert("stages", {
      recipeId: toRecipeId,
      key: stage.key,
      order: stage.order,
      title: stage.title,
      model: stage.model,
      effort: stage.effort,
      halt: haltOf(stage),
      lane: stage.lane,
    });
    const bindings = await ctx.db
      .query("bindings")
      .withIndex("by_stage", (q) => q.eq("stageId", stage._id))
      .collect();
    for (const binding of bindings) {
      await ctx.db.insert("bindings", {
        stageId,
        skillId: binding.skillId,
        gate: binding.gate,
        order: binding.order,
      });
    }
  }
}

async function jobsOnStage(
  ctx: QueryCtx | MutationCtx,
  recipeId: Id<"recipes">,
  key: string,
) {
  const jobs = await ctx.db
    .query("jobs")
    .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
    .collect();
  return jobs.filter((job) => job.stageKey === key);
}

export const list = query({
  args: {},
  returns: v.array(recipeListItem),
  handler: async (ctx) => {
    const recipes = await ctx.db.query("recipes").collect();
    const rows = [];
    for (const recipe of recipes) {
      const stages = await stagesOfRecipe(ctx, recipe._id);
      rows.push({
        _id: recipe._id,
        name: recipe.name,
        slug: recipe.slug,
        model: recipeModel(recipe.model),
        effort: recipeEffort(recipe.effort),
        requestTemplate: recipe.requestTemplate,
        stages: stages.map((s) => ({
          _id: s._id,
          key: s.key,
          title: s.title,
          order: s.order,
        })),
      });
    }
    return rows;
  },
});

export const get = query({
  args: { recipeId: v.id("recipes") },
  returns: v.union(recipeView, v.null()),
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) return null;
    return await toRecipeView(ctx, recipe);
  },
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
    return await toRecipeView(ctx, recipe);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    fromRecipeId: v.optional(v.id("recipes")),
  },
  returns: v.id("recipes"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (name === "") throw new Error("Name is required");
    const slug = await uniqueSlug(ctx, name);
    const source = args.fromRecipeId
      ? await requireRecipe(ctx, args.fromRecipeId)
      : null;
    const recipeId = await ctx.db.insert("recipes", {
      name,
      slug,
      model: source ? recipeModel(source.model) : undefined,
      effort: source ? recipeEffort(source.effort) : undefined,
      requestTemplate: source?.requestTemplate,
    });
    if (source) await copyStages(ctx, source._id, recipeId);
    return recipeId;
  },
});

export const update = mutation({
  args: {
    recipeId: v.id("recipes"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    requestTemplate: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const recipe = await requireRecipe(ctx, args.recipeId);
    const patch: { name?: string; slug?: string; requestTemplate?: string | undefined } = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name === "") throw new Error("Name is required");
      patch.name = name;
    }
    if (args.slug !== undefined) {
      patch.slug = await uniqueSlug(ctx, args.slug, recipe._id);
    }
    if (args.requestTemplate !== undefined) {
      const template = args.requestTemplate.trim();
      patch.requestTemplate = template === "" ? undefined : template;
    }
    if (patch.name === undefined && patch.slug === undefined && args.requestTemplate === undefined) {
      throw new Error("Nothing to update");
    }
    await ctx.db.patch(args.recipeId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { recipeId: v.id("recipes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRecipe(ctx, args.recipeId);
    const jobs = await ctx.db
      .query("jobs")
      .withIndex("by_recipe", (q) => q.eq("recipeId", args.recipeId))
      .first();
    if (jobs) throw new Error("Workflow is still used by a Job");
    const projects = await ctx.db.query("projects").collect();
    if (projects.some((p) => p.recipeId === args.recipeId)) {
      throw new Error("Workflow is still used by a Project");
    }
    const stages = await stagesOfRecipe(ctx, args.recipeId);
    for (const stage of stages) {
      const bindings = await ctx.db
        .query("bindings")
        .withIndex("by_stage", (q) => q.eq("stageId", stage._id))
        .collect();
      for (const binding of bindings) await ctx.db.delete(binding._id);
      await ctx.db.delete(stage._id);
    }
    await ctx.db.delete(args.recipeId);
    return null;
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
    await requireRecipe(ctx, args.recipeId);
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

export const addStage = mutation({
  args: {
    recipeId: v.id("recipes"),
    title: v.string(),
    beforeStageId: v.optional(v.id("stages")),
  },
  returns: v.id("stages"),
  handler: async (ctx, args) => {
    await requireRecipe(ctx, args.recipeId);
    const title = args.title.trim() || "Stage";
    const stages = await stagesOfRecipe(ctx, args.recipeId);
    let atOrder = stages.length;
    if (args.beforeStageId) {
      const before = stages.find((s) => s._id === args.beforeStageId);
      if (!before) throw new Error("Stage not found");
      atOrder = before.order;
      for (const stage of stages) {
        if (stage.order >= atOrder) {
          await ctx.db.patch(stage._id, { order: stage.order + 1 });
        }
      }
    }
    const key = uniqueKey(
      stages.map((s) => s.key),
      title,
    );
    return await ctx.db.insert("stages", {
      recipeId: args.recipeId,
      key,
      order: atOrder,
      title,
      halt: false,
    });
  },
});

export const updateStage = mutation({
  args: {
    stageId: v.id("stages"),
    title: v.optional(v.string()),
    key: v.optional(v.string()),
    model: v.optional(v.string()),
    effort: v.optional(v.string()),
    halt: v.optional(v.boolean()),
    lane: v.optional(v.union(stageLane, v.literal(""))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId);
    if (!stage) throw new Error("Stage not found");
    const patch: {
      title?: string;
      key?: string;
      model?: string;
      effort?: string;
      halt?: boolean;
      lane?: "planning" | "building" | "pr" | undefined;
    } = {};
    if (args.title !== undefined) {
      const title = args.title.trim();
      if (title === "") throw new Error("Title is required");
      patch.title = title;
    }
    if (args.key !== undefined) {
      const key = parseStageKey(args.key);
      if (key !== stage.key) {
        const busy = await jobsOnStage(ctx, stage.recipeId, stage.key);
        if (busy.length > 0) {
          throw new Error("A Job is still on this Stage");
        }
        const stages = await stagesOfRecipe(ctx, stage.recipeId);
        if (stages.some((s) => s.key === key && s._id !== stage._id)) {
          throw new Error("Stage key already exists on this Workflow");
        }
        patch.key = key;
      }
    }
    if (args.model !== undefined) {
      patch.model = args.model.trim() === "" ? undefined : args.model.trim();
    }
    if (args.effort !== undefined) {
      if (args.effort === "") patch.effort = undefined;
      else patch.effort = args.effort;
    }
    if (args.halt !== undefined) patch.halt = args.halt;
    if (args.lane !== undefined) {
      patch.lane = args.lane === "" ? undefined : args.lane;
    }
    if (Object.keys(patch).length === 0) throw new Error("Nothing to update");
    await ctx.db.patch(args.stageId, patch);
    return null;
  },
});

export const removeStage = mutation({
  args: { stageId: v.id("stages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId);
    if (!stage) throw new Error("Stage not found");
    const stages = await stagesOfRecipe(ctx, stage.recipeId);
    if (stages.length <= 1) throw new Error("Workflow needs at least one Stage");
    const busy = await jobsOnStage(ctx, stage.recipeId, stage.key);
    if (busy.length > 0) throw new Error("A Job is still on this Stage");
    const bindings = await ctx.db
      .query("bindings")
      .withIndex("by_stage", (q) => q.eq("stageId", stage._id))
      .collect();
    for (const binding of bindings) await ctx.db.delete(binding._id);
    await ctx.db.delete(stage._id);
    const left = stages.filter((s) => s._id !== stage._id);
    for (const [i, row] of left.entries()) {
      if (row.order !== i) await ctx.db.patch(row._id, { order: i });
    }
    return null;
  },
});

export const moveStage = mutation({
  args: {
    stageId: v.id("stages"),
    toOrder: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stage = await ctx.db.get(args.stageId);
    if (!stage) throw new Error("Stage not found");
    const stages = await stagesOfRecipe(ctx, stage.recipeId);
    const fromIndex = stages.findIndex((s) => s._id === stage._id);
    if (fromIndex < 0) throw new Error("Stage not found");
    const toIndex = Math.max(0, Math.min(args.toOrder, stages.length - 1));
    const next = placeStage(stages, fromIndex, toIndex);
    for (const [i, row] of next.entries()) {
      if (row.order !== i) await ctx.db.patch(row._id, { order: i });
    }
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
