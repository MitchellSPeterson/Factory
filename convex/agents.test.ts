/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
const profile = { name: "Reviewer", description: "Review changes", model: "composer-2.5", effort: "high" as const, guidance: "Prioritize correctness", skillIds: [] };
test("Agent validation, reuse, copy, and deletion protection", async () => {
  const t = convexTest(schema, modules);
  await expect(t.mutation(api.agents.save, { ...profile, name: " " })).rejects.toThrow();
  const agentId = await t.mutation(api.agents.save, profile);
  const recipeId = await t.mutation(api.recipes.create, { name: "Review" });
  const stageId = await t.mutation(api.recipes.addStage, { recipeId, title: "Review" });
  await t.mutation(api.recipes.updateStage, { stageId, agentProfileId: agentId });
  const copied = await t.mutation(api.recipes.create, { name: "Copy", fromRecipeId: recipeId });
  expect((await t.query(api.recipes.get, { recipeId: copied }))?.stages[0].agentProfileId).toBe(agentId);
  await expect(t.mutation(api.agents.remove, { agentId })).rejects.toThrow("Unassign");
  await t.mutation(api.recipes.remove, { recipeId: copied });
  await t.mutation(api.recipes.updateStage, { stageId, agentProfileId: null });
  await t.mutation(api.agents.remove, { agentId });
  expect(await t.query(api.agents.list, {})).toEqual([]);
  await expect(t.mutation(api.recipes.updateStage, { stageId, agentProfileId: agentId })).rejects.toThrow("Agent not found");
});
test("Run launch resolves Agent settings, merges Skills once, and respects Stage overrides", async () => {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const skillId = await ctx.db.insert("skills", { slug: "review", title: "Review", body: "Find bugs", sourceHint: "test" });
    const gatedId = await ctx.db.insert("skills", { slug: "gated", title: "Gated", body: "Conditional", sourceHint: "test" });
    const projectId = await ctx.db.insert("projects", { name: "Test", kind: "web", localPath: "/tmp/test", githubRepo: "a/b", defaultRuntime: "local" });
    const recipeId = await ctx.db.insert("recipes", { name: "Test", slug: "test", model: "fallback", effort: "low" });
    const agentId = await ctx.db.insert("agents", { ...profile, skillIds: [skillId] });
    const stageId = await ctx.db.insert("stages", { recipeId, agentProfileId: agentId, title: "Review", key: "review", order: 0 });
    await ctx.db.insert("bindings", { stageId, skillId, order: 0 });
    await ctx.db.insert("bindings", { stageId, skillId: gatedId, order: 1, gate: "largeAndThinSpec" });
    const jobId = await ctx.db.insert("jobs", { projectId, recipeId, request: "Review", runtime: "local", forceGrill: false, status: "queued", stageKey: "review" });
    const runId = await ctx.db.insert("runs", { jobId, stageKey: "review", status: "queued", runtime: "local", grillAttached: false });
    return { stageId, runId, agentId, skillId };
  });
  const launch = await t.mutation(api.worker.claim, { runId: ids.runId });
  expect(launch).toMatchObject({ model: profile.model, effort: "high" });
  expect(launch?.skills.map(s => s.slug)).toEqual(["agent-guidance", "review"]);
  expect(launch?.skills[0].body).toContain(profile.guidance);
  expect(await t.mutation(api.worker.claim, { runId: ids.runId })).toBeNull();
  await t.mutation(api.recipes.updateStage, { stageId: ids.stageId, model: "override", effort: "low" });
  await t.run(ctx => ctx.db.patch(ids.runId, { status: "queued" }));
  expect(await t.mutation(api.worker.claim, { runId: ids.runId })).toMatchObject({ model: "override", effort: "low" });
  await t.mutation(api.agents.save, { ...profile, agentId: ids.agentId, skillIds: [ids.skillId, ids.skillId] });
  expect((await t.query(api.agents.list, {}))[0].skillIds).toHaveLength(1);
});

test("Codex provider is saved, claimed with Stage overrides, and can revert to Worker default", async () => {
  const t = convexTest(schema, modules);
  const agentId = await t.mutation(api.agents.save, { ...profile, provider: "codex", model: "gpt-5.6-terra", effort: "max" });
  expect((await t.query(api.agents.list, {}))[0]).toMatchObject({ provider: "codex", effort: "max" });
  const runId = await t.run(async ctx => {
    const projectId = await ctx.db.insert("projects", { name: "Codex", kind: "web", localPath: "/tmp/codex", githubRepo: "a/b", defaultRuntime: "local" });
    const recipeId = await ctx.db.insert("recipes", { name: "Codex", slug: "codex", model: "fallback" });
    await ctx.db.insert("stages", { recipeId, agentProfileId: agentId, title: "Review", key: "review", order: 0, model: "gpt-6-astra", effort: "low" });
    const jobId = await ctx.db.insert("jobs", { projectId, recipeId, request: "Review", runtime: "local", forceGrill: false, status: "queued", stageKey: "review" });
    return await ctx.db.insert("runs", { jobId, stageKey: "review", status: "queued", runtime: "local", grillAttached: false });
  });
  expect(await t.mutation(api.worker.claim, { runId })).toMatchObject({ provider: "codex", model: "gpt-6-astra", effort: "low" });
  await t.mutation(api.agents.save, { ...profile, agentId });
  expect((await t.query(api.agents.list, {}))[0].provider).toBeUndefined();
});
