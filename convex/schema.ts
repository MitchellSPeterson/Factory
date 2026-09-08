import { defineSchema, defineTable } from "convex/server";
import {
  artifactKind,
  askKind,
  askStatus,
  gateName,
  jobStatus,
  projectKind,
  question,
  answer,
  runStatus,
  runtime,
  stageKey,
  stageLane,
} from "./lib/validators";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    kind: projectKind,
    localPath: v.string(),
    githubRepo: v.string(),
    defaultRuntime: runtime,
    recipeId: v.optional(v.id("recipes")),
  }).index("by_name", ["name"]),

  recipes: defineTable({
    name: v.string(),
    slug: v.string(),
    model: v.optional(v.string()),
    effort: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  stages: defineTable({
    recipeId: v.id("recipes"),
    key: stageKey,
    order: v.number(),
    title: v.string(),
    model: v.optional(v.string()),
    effort: v.optional(v.string()),
    halt: v.optional(v.boolean()),
    lane: v.optional(stageLane),
  })
    .index("by_recipe", ["recipeId"])
    .index("by_recipe_and_key", ["recipeId", "key"]),

  skills: defineTable({
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
  }).index("by_slug", ["slug"]),

  bindings: defineTable({
    stageId: v.id("stages"),
    skillId: v.id("skills"),
    gate: v.optional(gateName),
    order: v.number(),
  })
    .index("by_stage", ["stageId"])
    .index("by_skill", ["skillId"]),

  jobs: defineTable({
    projectId: v.id("projects"),
    recipeId: v.id("recipes"),
    request: v.string(),
    runtime: runtime,
    forceGrill: v.boolean(),
    status: jobStatus,
    stageKey: stageKey,
    acceptedSpec: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_project", ["projectId"])
    .index("by_recipe", ["recipeId"]),

  runs: defineTable({
    jobId: v.id("jobs"),
    stageKey: stageKey,
    status: runStatus,
    runtime: runtime,
    grillAttached: v.boolean(),
    agentId: v.optional(v.string()),
    cursorRunId: v.optional(v.string()),
    error: v.optional(v.string()),
  })
    .index("by_job", ["jobId"])
    .index("by_status", ["status"]),

  asks: defineTable({
    runId: v.id("runs"),
    jobId: v.id("jobs"),
    kind: askKind,
    questions: v.array(question),
    answers: v.optional(v.array(answer)),
    status: askStatus,
  })
    .index("by_run", ["runId"])
    .index("by_job", ["jobId"])
    .index("by_status", ["status"]),

  artifacts: defineTable({
    jobId: v.id("jobs"),
    runId: v.id("runs"),
    kind: artifactKind,
    body: v.string(),
  })
    .index("by_job", ["jobId"])
    .index("by_job_and_kind", ["jobId", "kind"])
    .index("by_run", ["runId"]),

  runMessages: defineTable({
    runId: v.id("runs"),
    jobId: v.id("jobs"),
    text: v.string(),
    createdAt: v.number(),
  }).index("by_run", ["runId"]),
});
