import { v } from "convex/values";

export const projectKind = v.union(
  v.literal("expo"),
  v.literal("web"),
  v.literal("mixed"),
);

export const runtime = v.union(v.literal("local"), v.literal("cloud"));

export const agentProvider = v.union(
  v.literal("cursor"),
  v.literal("codex"),
  v.literal("grok"),
  v.literal("claude"),
  v.literal("openai"),
);

export const agentModel = v.string();

export const agentEffort = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high"),
  v.literal("xhigh"),
  v.literal("max"),
  v.literal("ultra"),
);

export const sessionProvider = v.union(
  v.literal("grok"),
  v.literal("codex"),
  v.literal("cursor"),
  v.literal("claude"),
  v.literal("openai"),
);

export const sessionStatus = v.union(
  v.literal("idle"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("failed"),
  v.literal("stopped"),
);

export const sessionMessageRole = v.union(v.literal("user"), v.literal("assistant"));

export const permissionMode = v.union(
  v.literal("supervised"),
  v.literal("auto-accept-edits"),
  v.literal("auto"),
  v.literal("full-access"),
);
export type PermissionMode = "supervised" | "auto-accept-edits" | "auto" | "full-access";
export const DEFAULT_PERMISSION_MODE: PermissionMode = "supervised";

export const serviceTier = v.union(
  v.literal("standard"),
  v.literal("flex"),
  v.literal("priority"),
);
export type ServiceTier = "standard" | "flex" | "priority";
export const DEFAULT_SERVICE_TIER: ServiceTier = "standard";

export const sessionItemKind = v.union(
  v.literal("message"),
  v.literal("tool"),
  v.literal("permission"),
  v.literal("reasoning"),
);

export const sessionItemStatus = v.union(
  v.literal("inProgress"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("pending"),
  v.literal("resolved"),
  v.literal("denied"),
);

export const permissionOption = v.object({
  optionId: v.string(),
  name: v.string(),
  kind: v.optional(v.string()),
});

export const grokCatalogModel = v.object({
  slug: v.string(),
  name: v.string(),
  isDefault: v.optional(v.boolean()),
});

export const grokCatalog = v.object({
  checkedAt: v.number(),
  installed: v.boolean(),
  authenticated: v.optional(v.boolean()),
  version: v.optional(v.string()),
  message: v.optional(v.string()),
  models: v.array(grokCatalogModel),
});

const usageWindow = v.object({
  name: v.string(),
  percentUsed: v.number(),
  resetsAt: v.optional(v.number()),
  windowSeconds: v.optional(v.number()),
});

const providerMeterAmounts = {
  provider: agentProvider,
  checkedAt: v.number(),
  plan: v.optional(v.string()),
  usedCents: v.optional(v.number()),
  remainingCents: v.optional(v.number()),
  limitCents: v.optional(v.number()),
  percentUsed: v.optional(v.number()),
  resetsAt: v.optional(v.number()),
  display: v.optional(v.string()),
  windows: v.optional(v.array(usageWindow)),
};

export const providerMeter = v.union(
  v.object({
    ...providerMeterAmounts,
    status: v.literal("ok"),
  }),
  v.object({
    provider: agentProvider,
    status: v.literal("unconfigured"),
    checkedAt: v.number(),
    message: v.string(),
  }),
  v.object({
    provider: agentProvider,
    status: v.literal("error"),
    checkedAt: v.number(),
    message: v.string(),
  }),
);

export const providerUsage = v.object({
  checkedAt: v.number(),
  meters: v.array(providerMeter),
});

export const simDeviceState = v.union(
  v.literal("booted"),
  v.literal("shutdown"),
  v.literal("creating"),
  v.literal("unknown"),
);

export const simDevice = v.object({
  udid: v.string(),
  name: v.string(),
  state: simDeviceState,
  runtime: v.optional(v.string()),
  previewUrl: v.optional(v.string()),
  streamUrl: v.optional(v.string()),
  wsUrl: v.optional(v.string()),
});

export const simHub = v.object({
  checkedAt: v.number(),
  supported: v.boolean(),
  running: v.boolean(),
  message: v.optional(v.string()),
  devices: v.array(simDevice),
});

export const deviceCommand = v.union(
  v.object({ kind: v.literal("boot"), udid: v.string() }),
  v.object({ kind: v.literal("shutdown"), udid: v.string() }),
  v.object({ kind: v.literal("button"), udid: v.string(), name: v.literal("home") }),
);

export const deviceCommandStatus = v.union(
  v.literal("queued"),
  v.literal("taken"),
);

/** Absolute token counts for a Session or Project. */
export const tokenUsage = v.object({
  inputTokens: v.number(),
  outputTokens: v.number(),
  cacheReadTokens: v.number(),
  cacheWriteTokens: v.number(),
  reasoningTokens: v.number(),
  totalTokens: v.number(),
});
