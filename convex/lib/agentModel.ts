export const DEFAULT_AGENT_MODEL = "composer-2.5";
export const DEFAULT_AGENT_EFFORT = "medium";

export const AGENT_MODELS = [
  "composer-2.5",
  "composer-2",
  "auto-smart",
  "grok-4.6",
  "grok-4.5",
  "claude-opus-5-thinking-high",
  "gpt-5.6-sol-medium",
] as const;

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
  if (model === "auto-smart") {
    const value =
      effort === "low" ? "speed" : ["high", "xhigh", "max", "ultra"].includes(effort)
        ? "quality"
        : "balanced";
    return { id: model, params: [{ id: "optimize_for", value }] };
  }
  if (effort === "medium") return { id: model };
  if (effort === "low") return { id: model, params: [{ id: "fast", value: "true" }] };
  return { id: model, params: [{ id: "reasoning_effort", value: effort }] };
}

export const CODEX_MODELS = ["gpt-5.6-terra", "gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.5"] as const;
export const GROK_MODELS = ["grok-4.6", "grok-4.5", "grok-build-0.1"] as const;
export const AGENT_PROVIDERS = ["cursor", "codex", "grok", "openai"] as const;
export type AgentProvider = (typeof AGENT_PROVIDERS)[number];
export function providerLabel(provider?: AgentProvider) {
  return provider === "codex" ? "Codex" : provider === "cursor" ? "Cursor" : provider === "grok" ? "Grok Build" : provider === "openai" ? "OpenAI-compatible API" : "Worker default";
}

/** Older Agents and unassigned Stages retain the worker's configured provider. */
export function resolveProvider(provider?: AgentProvider, workerDefault?: string): AgentProvider {
  const resolved = provider ?? workerDefault ?? "cursor";
  if (!AGENT_PROVIDERS.includes(resolved as AgentProvider)) throw new Error("Unknown Factory provider");
  return resolved as AgentProvider;
}
