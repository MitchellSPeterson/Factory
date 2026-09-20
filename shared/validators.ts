export type PermissionMode = "supervised" | "auto-accept-edits" | "auto" | "full-access";
export const DEFAULT_PERMISSION_MODE: PermissionMode = "supervised";

export type ServiceTier = "standard" | "flex" | "priority";
export const DEFAULT_SERVICE_TIER: ServiceTier = "standard";

export type ProjectKind = "expo" | "web" | "mixed";
export type Runtime = "local" | "cloud";
export type SessionProvider = "grok" | "codex" | "cursor" | "claude" | "openai";
export type SessionStatus = "idle" | "queued" | "running" | "failed" | "stopped";
export type SessionMessageRole = "user" | "assistant";
export type SessionItemKind = "message" | "tool" | "permission" | "reasoning";
export type SessionItemStatus =
  | "inProgress"
  | "completed"
  | "failed"
  | "pending"
  | "resolved"
  | "denied";
export type AgentEffort = "low" | "medium" | "high" | "xhigh" | "max" | "ultra";

export type PermissionOption = {
  optionId: string;
  name: string;
  kind?: string;
};
