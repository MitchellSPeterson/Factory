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

export const AGENT_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

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
      effort === "low" ? "speed" : effort === "high" || effort === "xhigh"
        ? "quality"
        : "balanced";
    return { id: model, params: [{ id: "optimize_for", value }] };
  }
  if (effort === "medium") return { id: model };
  if (effort === "low") return { id: model, params: [{ id: "fast", value: "true" }] };
  return { id: model, params: [{ id: "reasoning_effort", value: effort }] };
}