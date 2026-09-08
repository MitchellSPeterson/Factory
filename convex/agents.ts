import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { agentEffort, agentProvider } from "./lib/validators";
import schema from "./schema";

const fields = { provider: v.optional(agentProvider), name: v.string(), description: v.string(), model: v.string(), effort: agentEffort, guidance: v.string(), skillIds: v.array(v.id("skills")) };
export const list = query({
  args: {}, returns: v.array(schema.tables.agents.validator.extend({ _id: v.id("agents"), _creationTime: v.number() })),
  handler: async (ctx) => await ctx.db.query("agents").withIndex("by_name").take(250),
});
export const save = mutation({
  args: { agentId: v.optional(v.id("agents")), ...fields }, returns: v.id("agents"),
  handler: async (ctx, { agentId, ...data }) => {
    const name = data.name.trim(), model = data.model.trim();
    if (!name || name.length > 100) throw new Error("Use an Agent name between 1 and 100 characters");
    if (!model || model.length > 200) throw new Error("Model is required (up to 200 characters)");
    if (data.description.length > 2000 || data.guidance.length > 20000) throw new Error("Description or guidance is too long");
    const skillIds = [...new Set(data.skillIds)];
    if (skillIds.length > 50) throw new Error("Choose up to 50 Skills per Agent");
    for (const id of skillIds) if (!await ctx.db.get(id)) throw new Error("Skill not found");
    const value = { ...data, provider: data.provider, name, model, skillIds };
    if (agentId) {
      if (!await ctx.db.get(agentId)) throw new Error("Agent not found");
      await ctx.db.patch(agentId, value);
      return agentId;
    }
    return await ctx.db.insert("agents", value);
  },
});
export const remove = mutation({
  args: { agentId: v.id("agents") }, returns: v.null(),
  handler: async (ctx, { agentId }) => {
    if (await ctx.db.query("stages").withIndex("by_agentProfileId", q => q.eq("agentProfileId", agentId)).first()) throw new Error("Unassign this Agent from its Stages before deleting it");
    if (!await ctx.db.get(agentId)) throw new Error("Agent not found");
    await ctx.db.delete(agentId);
    return null;
  },
});
