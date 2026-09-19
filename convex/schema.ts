import { defineSchema, defineTable } from "convex/server";
import {
  agentEffort,
  grokCatalog,
  providerUsage,
  simHub,
  deviceCommand,
  deviceCommandStatus,
  permissionMode,
  permissionOption,
  serviceTier,
  sessionItemKind,
  sessionItemStatus,
  sessionProvider,
  sessionStatus,
  sessionMessageRole,
  projectKind,
  runtime,
  tokenUsage,
} from "./lib/validators";
import { v } from "convex/values";

import { projectOperation, operationResult, operationState } from "./lib/projectOperations";

export default defineSchema({
  terminals: defineTable({
    projectId: v.id("projects"), serverId: v.id("servers"), title: v.string(),
    state: v.union(v.literal("queued"), v.literal("running"), v.literal("exited")),
    owner: v.optional(v.string()), leaseUntil: v.number(),
    cols: v.number(), rows: v.number(), message: v.optional(v.string()),
  }).index("by_projectId", ["projectId"]).index("by_serverId_and_state", ["serverId", "state"]),
  terminalIO: defineTable({
    terminalId: v.id("terminals"), input: v.string(), inputEnd: v.number(),
    output: v.string(), outputEnd: v.number(),
  }).index("by_terminalId", ["terminalId"]),
  projectOperations: defineTable({
    projectId: v.id("projects"), serverId: v.id("servers"), operation: projectOperation,
    state: operationState, output: v.string(), result: v.optional(operationResult),
    startedAt: v.optional(v.number()), error: v.optional(v.string()),
  }).index("by_serverId_and_state", ["serverId", "state"]).index("by_projectId", ["projectId"]),
  servers: defineTable({
    accessKey: v.string(), name: v.string(), publicKey: v.string(), projectsRoot: v.string(), lastSeen: v.number(),
    grokCatalog: v.optional(grokCatalog),
    providerUsage: v.optional(providerUsage),
    pty: v.optional(v.object({ checkedAt: v.number(), os: v.optional(v.string()), url: v.string() })),
    simHubWanted: v.optional(v.boolean()),
    simHub: v.optional(simHub),
  }).index("by_accessKey", ["accessKey"]).index("by_lastSeen", ["lastSeen"]),
  ptyTickets: defineTable({
    token: v.string(),
    projectId: v.id("projects"),
    serverId: v.id("servers"),
    expiresAt: v.number(),
  }).index("by_token", ["token"]),
  deviceCommands: defineTable({
    serverId: v.id("servers"),
    commandId: v.string(),
    command: deviceCommand,
    status: deviceCommandStatus,
    leaseUntil: v.number(),
  }).index("by_serverId_and_status", ["serverId", "status"]).index("by_serverId_and_commandId", ["serverId", "commandId"]),
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
    usage: v.optional(tokenUsage),
    skills: v.optional(
      v.array(
        v.object({
          slug: v.string(),
          title: v.string(),
          description: v.string(),
          relPath: v.string(),
        }),
      ),
    ),
  }).index("by_name", ["name"]).index("by_serverId_and_githubRepo", ["serverId", "githubRepo"]),

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

  sessions: defineTable({
    projectId: v.id("projects"),
    title: v.string(),
    provider: sessionProvider,
    model: v.string(),
    effort: agentEffort,
    permissionMode: v.optional(permissionMode),
    serviceTier: v.optional(serviceTier),
    status: sessionStatus,
    agentId: v.optional(v.string()),
    error: v.optional(v.string()),
    usage: v.optional(tokenUsage),
    durationMs: v.optional(v.number()),
    turnStartedAt: v.optional(v.number()),
  })
    .index("by_project", ["projectId"])
    .index("by_status", ["status"]),

  sessionMessages: defineTable({
    sessionId: v.id("sessions"),
    role: sessionMessageRole,
    text: v.string(),
    imageIds: v.optional(v.array(v.id("_storage"))),
    skillSlugs: v.optional(v.array(v.string())),
    createdAt: v.number(),
    kind: v.optional(sessionItemKind),
    itemId: v.optional(v.string()),
    status: v.optional(sessionItemStatus),
    title: v.optional(v.string()),
    detail: v.optional(v.string()),
    requestId: v.optional(v.string()),
    decision: v.optional(v.string()),
    options: v.optional(v.array(permissionOption)),
  }).index("by_session", ["sessionId"]),
});
