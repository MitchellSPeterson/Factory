import {
  AGENT_EFFORTS,
  CODEX_MODELS,
  CURSOR_MODELS,
  GROK_MODELS,
  PERMISSION_MODES,
  SERVICE_TIERS,
} from "../../../convex/lib/agentModel";
import {
  DEFAULT_PERMISSION_MODE,
  DEFAULT_SERVICE_TIER,
  type PermissionMode,
  type ServiceTier,
} from "../../../convex/lib/validators";

export type ChatSettings = {
  provider: "codex" | "cursor" | "grok";
  model: string;
  effort: (typeof AGENT_EFFORTS)[number];
  permissionMode: PermissionMode;
  serviceTier: ServiceTier;
};

const MODELS: Record<ChatSettings["provider"], readonly string[]> = {
  codex: CODEX_MODELS,
  cursor: CURSOR_MODELS,
  grok: GROK_MODELS,
};

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  provider: "codex",
  model: CODEX_MODELS[0],
  effort: "medium",
  permissionMode: DEFAULT_PERMISSION_MODE,
  serviceTier: DEFAULT_SERVICE_TIER,
};

function isProvider(value: unknown): value is ChatSettings["provider"] {
  return value === "codex" || value === "cursor" || value === "grok";
}

function isEffort(value: unknown): value is ChatSettings["effort"] {
  return typeof value === "string" && AGENT_EFFORTS.some((effort) => effort === value);
}

function isPermissionMode(value: unknown): value is PermissionMode {
  return typeof value === "string" && PERMISSION_MODES.some((mode) => mode === value);
}

function isServiceTier(value: unknown): value is ServiceTier {
  return typeof value === "string" && SERVICE_TIERS.some((tier) => tier === value);
}

export function parseLastSettings(raw: string): ChatSettings {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return DEFAULT_CHAT_SETTINGS;
    if (!("provider" in parsed) || !("model" in parsed) || !("effort" in parsed)) {
      return DEFAULT_CHAT_SETTINGS;
    }
    const { provider, model, effort } = parsed;
    if (!isProvider(provider) || typeof model !== "string" || !isEffort(effort)) {
      return DEFAULT_CHAT_SETTINGS;
    }
    if (!MODELS[provider].includes(model)) return DEFAULT_CHAT_SETTINGS;
    const permissionMode =
      "permissionMode" in parsed && isPermissionMode(parsed.permissionMode)
        ? parsed.permissionMode
        : DEFAULT_PERMISSION_MODE;
    const serviceTier =
      "serviceTier" in parsed && isServiceTier(parsed.serviceTier)
        ? parsed.serviceTier
        : DEFAULT_SERVICE_TIER;
    return { provider, model, effort, permissionMode, serviceTier };
  } catch {
    return DEFAULT_CHAT_SETTINGS;
  }
}
