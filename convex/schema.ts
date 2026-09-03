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
} from "./lib/validators";
import { v } from "convex/values";

export default defineSchema({
  projects: defineTable({
    name: v.string(),
    kind: projectKind,
    localPath: v.string(),
    githubRepo: v.string(),
    defaultRuntime: runtime,
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
  })
    .index("by_recipe", ["recipeId"])
    .index("by_recipe_and_key", ["recipeId", "key"]),

  skills: defineTable({
    slug: v.string(),
    title: v.string(),
    body: v.string(),
    sourceHint: v.string(),
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
    .index("by_project", ["projectId"]),

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
