export const DEFAULT_AGENT_MODEL = "composer-2.5";
export const DEFAULT_AGENT_EFFORT = "medium";

export const AGENT_MODELS = [
  "composer-2.5",
  "composer-2",
  "default",
  "grok-4.6",
  "grok-4.5",
  "claude-opus-5",
  "gpt-5.6-sol",
] as const;

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

export const CODEX_MODELS = ["gpt-5.6-terra", "gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.5"] as const;
export const GROK_MODELS = ["grok-4.6", "grok-4.5", "grok-build-0.1"] as const;
export const CLAUDE_MODELS = ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-5"] as const;
export const OPENAI_MODELS = ["gpt-5.6", "gpt-5.4", "gpt-4.1"] as const;
export const CURSOR_MODELS = AGENT_MODELS;
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
