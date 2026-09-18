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
  if (message.kind === "reasoning") {
    if (message.status === "inProgress") return "Thinking";
    return humanizeToolTitle(message.title) === "Reasoning"
      ? "Thought"
      : humanizeToolTitle(message.title) || "Thought";
  }
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

export type ToolAction = "read" | "edit" | "command" | "search" | "other";

export function toolAction(message: ActivityMessage): ToolAction {
  const title = humanizeToolTitle(message.title) || message.title || "";
  if (/^(read|view|open|cat)\b/i.test(title)) return "read";
  if (/^(edit|write|delete|move|patch|update|changed|apply)\b/i.test(title)) return "edit";
  if (/^(command|bash|shell|run|exec)\b/i.test(title) || title === "Command") return "command";
  if (/find|search|grep|glob|ripgrep/i.test(title)) return "search";
  return "other";
}

export function workRowLabel(message: ActivityMessage): string {
  if (message.kind === "reasoning") return activityTitle(message);
  const title = activityTitle(message);
  if (title !== "Tool") return title;
  return activitySummary(message) ?? title;
}

export function isLiveTool(message: ActivityMessage): boolean {
  return message.kind === "tool" && message.status === "inProgress";
}

export function hasLiveTool(messages: readonly ActivityMessage[]): boolean {
  return messages.some(isLiveTool);
}

function countNoun(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function actionSummary(action: ToolAction, count: number): string {
  if (action === "read") return `Read ${countNoun(count, "file", "files")}`;
  if (action === "edit") return `Changed ${countNoun(count, "file", "files")}`;
  if (action === "command") return `Ran ${countNoun(count, "command", "commands")}`;
  if (action === "search") return `Searched code ${countNoun(count, "time", "times")}`;
  return `Used ${countNoun(count, "tool", "tools")}`;
}

export function summarizeToolGroup(messages: readonly ActivityMessage[]): string {
  const tools = messages.filter((message) => message.kind === "tool");
  if (tools.length === 0) return "Thought";
  if (tools.length === 1) {
    const only = tools[0]!;
    if (toolAction(only) === "edit") return "Changed 1 file";
    return workRowLabel(only);
  }
  const grouped = new Map<ToolAction, number>();
  for (const message of tools) {
    const action = toolAction(message);
    grouped.set(action, (grouped.get(action) ?? 0) + 1);
  }
  const labels: string[] = [];
  const order: ToolAction[] = ["read", "edit", "command", "search", "other"];
  for (const action of order) {
    const count = grouped.get(action);
    if (count) labels.push(actionSummary(action, count));
  }
  const sentence = labels.map((label, index) =>
    index === 0 ? label : `${label.charAt(0).toLowerCase()}${label.slice(1)}`,
  );
  if (sentence.length === 1) return sentence[0]!;
  if (sentence.length === 2) return `${sentence[0]} and ${sentence[1]}`;
  return `${sentence.slice(0, -1).join(", ")}, and ${sentence.at(-1)}`;
}

export function toolGroupAction(messages: readonly ActivityMessage[]): ToolAction | "mixed" {
  const actions = new Set(
    messages.filter((message) => message.kind === "tool").map(toolAction),
  );
  if (actions.size === 1) return [...actions][0]!;
  return "mixed";
}

export function liveWorkLabel(messages: readonly ActivityMessage[]): string {
  const live = [...messages].reverse().find(isLiveTool);
  if (live) return workRowLabel(live);
  return summarizeToolGroup(messages);
}

export type ChatFeedRow<T extends ActivityMessage> =
  | { type: "message"; message: T }
  | { type: "permission"; message: T }
  | { type: "work"; id: string; messages: T[] };

export function groupChatFeed<T extends ActivityMessage & { _id: string }>(
  messages: readonly T[],
): ChatFeedRow<T>[] {
  const rows: ChatFeedRow<T>[] = [];
  let group: T[] = [];
  const flush = () => {
    if (group.length === 0) return;
    rows.push({ type: "work", id: group[0]!._id, messages: group });
    group = [];
  };
  for (const message of messages) {
    if (message.kind === "permission") {
      flush();
      rows.push({ type: "permission", message });
      continue;
    }
    if (message.kind === "tool" || message.kind === "reasoning") {
      group.push(message);
      continue;
    }
    flush();
    rows.push({ type: "message", message });
  }
  flush();
  return rows;
}

export function shouldShowThinkingRow(input: {
  busy: boolean;
  queued: boolean;
  awaitingApproval: boolean;
  messages: readonly ActivityMessage[];
}): boolean {
  if (!input.busy || input.queued || input.awaitingApproval || hasLiveTool(input.messages)) {
    return false;
  }
  const tail: ActivityMessage[] = [];
  for (let index = input.messages.length - 1; index >= 0; index -= 1) {
    const message = input.messages[index]!;
    if (message.kind === "tool" || message.kind === "reasoning") tail.unshift(message);
    else break;
  }
  return tail.some((message) => message.kind === "tool") || tail.length === 0;
}
