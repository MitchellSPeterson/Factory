export type ActivityOption = {
  optionId: string;
  name: string;
  kind?: string;
};

export type ActivityMessage = {
  kind?: "message" | "tool" | "permission" | "reasoning";
  title?: string;
  detail?: string;
  text: string;
  status?: string;
  decision?: string;
  requestId?: string;
  options?: ActivityOption[];
};

export function humanizeToolTitle(title: string | undefined): string {
  if (!title) return "";
  const trimmed = title.trim();
  if (trimmed === "" || trimmed === "Tool" || trimmed === "Tool activity") return "";
  const mcp = /^[A-Za-z0-9][A-Za-z0-9_-]*__([A-Za-z0-9_]+)$/.exec(trimmed);
  return mcp?.[1] ?? trimmed;
}

export function activityTitle(message: ActivityMessage): string {
  if (message.kind === "reasoning") return humanizeToolTitle(message.title) || "Thinking";
  if (message.kind === "permission") return humanizeToolTitle(message.title) || "Approval needed";
  return humanizeToolTitle(message.title) || "Tool";
}

export function activitySummary(message: ActivityMessage): string | undefined {
  const title = activityTitle(message);
  const detail = (message.detail || message.text || "").trim();
  if (detail === "") return undefined;
  const first = detail.split("\n")[0]?.trim() ?? "";
  if (first === "" || first === title) return undefined;
  if (title.length > 48) return undefined;
  return first;
}

export function permissionLabel(name: string): string {
  const trimmed = name.trim().replace(/[_-]+/g, " ").toLowerCase();
  if (trimmed === "") return name;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export type PermissionVariant = "allow-always" | "allow-once" | "reject";

export function permissionVariant(option: ActivityOption): PermissionVariant {
  if (option.kind === "allow_always" || /always/i.test(option.name)) return "allow-always";
  if (option.kind === "reject_once" || option.kind === "reject_always" || /reject/i.test(option.name)) {
    return "reject";
  }
  return "allow-once";
}

export function hasPendingPermission(messages: readonly ActivityMessage[]): boolean {
  return messages.some(
    (message) => message.kind === "permission" && message.status === "pending" && !message.decision,
  );
}

export function selectedPermissionLabel(message: ActivityMessage): string | undefined {
  if (!message.decision) return undefined;
  const selected = message.options?.find((option) => option.optionId === message.decision);
  if (!selected) return message.status === "denied" ? "Rejected" : "Allowed";
  return permissionLabel(selected.name);
}
