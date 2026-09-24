export const DEFAULT_AGENT_MODEL = "composer-2.5";
export const DEFAULT_AGENT_EFFORT = "medium";

const CURSOR_MODEL_ALIASES: Record<string, string> = {
  "auto-smart": "default",
  auto: "default",
  "claude-opus-5-thinking-high": "claude-opus-5",
  "gpt-5.6-sol-medium": "gpt-5.6-sol",
};

export function canonicalCursorModel(model: string) {
  return CURSOR_MODEL_ALIASES[model] ?? model;
}

export const AGENT_EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultra"] as const;

export function recipeModel(model?: string) {
  return model && model.trim() !== "" ? model : DEFAULT_AGENT_MODEL;
}

export function recipeEffort(effort?: string) {
  return AGENT_EFFORTS.includes(effort as (typeof AGENT_EFFORTS)[number])
    ? (effort as (typeof AGENT_EFFORTS)[number])
    : DEFAULT_AGENT_EFFORT;
}

export function toModelSelection(model: string, effort: string) {
  const id = canonicalCursorModel(model);
  // ponytail: personal Cursor catalogs expose Auto as `default`, not Router `auto-smart`.
  if (id === "default") return { id };
  if (effort === "medium") return { id };
  if (effort === "low") return { id, params: [{ id: "fast", value: "true" }] };
  return { id, params: [{ id: "reasoning_effort", value: effort }] };
}

export const AGENT_PROVIDERS = ["cursor", "codex", "grok", "claude", "openai"] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];
export function providerLabel(provider?: AgentProvider) {
  if (provider === "codex") return "Codex";
  if (provider === "cursor") return "Cursor";
  if (provider === "grok") return "Grok Build";
  if (provider === "claude") return "Claude Code";
  if (provider === "openai") return "OpenAI-compatible API";
  return "Worker default";
}

export const PERMISSION_MODES = ["supervised", "auto-accept-edits", "auto", "full-access"] as const;
export function permissionModeLabel(mode: (typeof PERMISSION_MODES)[number]) {
  if (mode === "auto-accept-edits") return "Auto-accept edits";
  if (mode === "full-access") return "Full access";
  if (mode === "auto") return "Auto";
  return "Supervised";
}

export function permissionModeDescription(mode: (typeof PERMISSION_MODES)[number]) {
  if (mode === "auto-accept-edits") return "Auto-approve edits, ask before other actions.";
  if (mode === "full-access") return "Allow commands and edits without prompts.";
  if (mode === "auto") return "Supported providers approve routine actions; others still ask.";
  return "Ask before commands and file changes.";
}

export const SERVICE_TIERS = ["standard", "flex", "priority"] as const;
export function serviceTierLabel(tier: (typeof SERVICE_TIERS)[number]) {
  if (tier === "flex") return "Flex";
  if (tier === "priority") return "Priority";
  return "Standard";
}

export function serviceTierDescription(tier: (typeof SERVICE_TIERS)[number]) {
  if (tier === "flex") return "Lower cost, with more latency.";
  if (tier === "priority") return "Faster processing when the account allows it.";
  return "Default routing and pricing.";
}

export function codexSandboxMode(
  mode: (typeof PERMISSION_MODES)[number],
): "workspace-write" | "danger-full-access" {
  return mode === "full-access" ? "danger-full-access" : "workspace-write";
}

export function codexServiceTierConfig(tier: (typeof SERVICE_TIERS)[number]) {
  return tier === "standard" ? "default" : tier;
}

export function resolveProvider(provider?: AgentProvider, workerDefault?: string): AgentProvider {
  const resolved = provider ?? workerDefault ?? "cursor";
  if (!AGENT_PROVIDERS.includes(resolved as AgentProvider)) throw new Error("Unknown Factory provider");
  return resolved as AgentProvider;
}
