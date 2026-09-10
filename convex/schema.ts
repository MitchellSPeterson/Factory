import { defineSchema, defineTable } from "convex/server";
import {
  agentEffort,
  agentProvider,
  artifactKind,
  askKind,
  askStatus,
  gateName,
  jobCommand,
  jobStatus,
  messageDelivery,
  projectKind,
  question,
  answer,
  runStatus,
  runtime,
  stageKey,
  stageLane,
  tokenUsage,
  contextBreakdown,
} from "./lib/validators";
import { v } from "convex/values";

export default defineSchema({
  agents: defineTable({
    provider: v.optional(agentProvider),
    name: v.string(), description: v.string(), model: v.string(), effort: agentEffort,
    guidance: v.string(), skillIds: v.array(v.id("skills")),
  }).index("by_name", ["name"]),
  servers: defineTable({
    accessKey: v.string(), name: v.string(), publicKey: v.string(), projectsRoot: v.string(), lastSeen: v.number(),
  }).index("by_accessKey", ["accessKey"]),
  environment: defineTable({
    serverId: v.id("servers"), scope: v.string(), name: v.string(), sealed: v.string(), updatedAt: v.number(),
  }).index("by_serverId_and_scope_and_name", ["serverId", "scope", "name"]),
  githubConnection: defineTable({
    login: v.string(),
    token: v.string(),
  }),
  projectImports: defineTable({
    projectId: v.id("projects"), serverId: v.id("servers"), repo: v.string(), sealedToken: v.optional(v.string()),
    status: v.union(v.literal("queued"), v.literal("cloning"), v.literal("ready"), v.literal("failed")),
    leaseUntil: v.number(), attempt: v.number(),
  }).index("by_serverId_and_status", ["serverId", "status"]).index("by_projectId", ["projectId"]),
  projects: defineTable({
    name: v.string(),
    serverId: v.optional(v.id("servers")),
    cloneStatus: v.optional(v.union(v.literal("queued"), v.literal("cloning"), v.literal("ready"), v.literal("failed"))),
    cloneError: v.optional(v.string()),
    kind: projectKind,
    localPath: v.string(),
    githubRepo: v.string(),
    defaultRuntime: runtime,
    recipeId: v.optional(v.id("recipes")),
    usage: v.optional(tokenUsage),
  }).index("by_name", ["name"]).index("by_serverId_and_githubRepo", ["serverId", "githubRepo"]),

  recipes: defineTable({
    name: v.string(),
    slug: v.string(),
    model: v.optional(v.string()),
    effort: v.optional(v.string()),
    requestTemplate: v.optional(v.string()),
  }).index("by_slug", ["slug"]),

  stages: defineTable({
    recipeId: v.id("recipes"),
    agentProfileId: v.optional(v.id("agents")),
    key: stageKey,
    order: v.number(),
    title: v.string(),
    model: v.optional(v.string()),
    effort: v.optional(v.string()),
    halt: v.optional(v.boolean()),
    lane: v.optional(stageLane),
  })
    .index("by_recipe", ["recipeId"])
    .index("by_recipe_and_key", ["recipeId", "key"])
    .index("by_agentProfileId", ["agentProfileId"]),

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
    githubIssueUrl: v.optional(v.string()),
    milestone: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    usage: v.optional(tokenUsage),
    durationMs: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_project", ["projectId"])
    .index("by_recipe", ["recipeId"]),

  jobCommands: defineTable({
    jobId: v.id("jobs"),
    commandId: v.string(),
    command: jobCommand,
    delivery: v.optional(messageDelivery),
  })
    .index("by_job", ["jobId"])
    .index("by_job_and_commandId", ["jobId", "commandId"]),

  runs: defineTable({
    jobId: v.id("jobs"),
    stageKey: stageKey,
    status: runStatus,
    runtime: runtime,
    grillAttached: v.boolean(),
    agentId: v.optional(v.string()),
    cursorRunId: v.optional(v.string()),
    error: v.optional(v.string()),
    endedByCommandId: v.optional(v.id("jobCommands")),
    usage: v.optional(tokenUsage),
    contextBreakdown: v.optional(contextBreakdown),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    durationMs: v.optional(v.number()),
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
