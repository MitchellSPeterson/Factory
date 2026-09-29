import type { ThreadItem } from "@openai/codex-sdk";
import type { SDKToolUseMessage } from "@cursor/sdk";
import type { GrokSessionItem } from "./grokAcp";

export type SessionItem = GrokSessionItem;

const oneLine = (value: string, max = 80) => {
  const line = value.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};
const json = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.trim() === "" ? undefined : text;
};
const withBody = (item: SessionItem, body: string | undefined): SessionItem =>
  body ? { ...item, detail: body, text: body } : item;

/** Codex tool-ish items as chat rows; agent_message and reasoning are handled by the caller. */
export function codexItemToSessionItem(item: ThreadItem, done: boolean): SessionItem | null {
  if (item.type === "command_execution") {
    const status = item.status === "failed" || (done && (item.exit_code ?? 0) !== 0)
      ? "failed" : item.status === "completed" || done ? "completed" : "inProgress";
    return withBody(
      { itemId: item.id, kind: "tool", title: `Run ${oneLine(item.command)}`, status },
      [`$ ${item.command}`, item.aggregated_output.trimEnd()].filter(Boolean).join("\n"),
    );
  }
  if (item.type === "file_change") {
    const paths = item.changes.map((change) => change.path);
    return withBody(
      { itemId: item.id, kind: "tool", title: `Edit ${oneLine(paths.join(", "))}`, status: item.status === "failed" ? "failed" : done ? "completed" : "inProgress" },
      item.changes.map((change) => `${change.kind}: ${change.path}`).join("\n"),
    );
  }
  if (item.type === "mcp_tool_call") {
    return withBody(
      { itemId: item.id, kind: "tool", title: `${item.server}: ${item.tool}`, status: item.status === "failed" ? "failed" : item.status === "completed" ? "completed" : "inProgress" },
      item.error?.message ?? json(item.arguments),
    );
  }
  if (item.type === "web_search") {
    return { itemId: item.id, kind: "tool", title: `Search ${oneLine(item.query)}`, status: done ? "completed" : "inProgress" };
  }
  return null;
}

/** Cursor tool_call events carry args/result; names are snake_case tool ids. */
export function cursorToolToSessionItem(event: Pick<SDKToolUseMessage, "call_id" | "name" | "status" | "args" | "result">): SessionItem {
  const args = event.args as Record<string, unknown> | undefined;
  const target = [args?.command, args?.path, args?.pattern, args?.query, args?.url]
    .find((value): value is string => typeof value === "string");
  const name = event.name.replace(/_/g, " ");
  const title = target ? `${name.charAt(0).toUpperCase()}${name.slice(1)} ${oneLine(target)}` : name;
  return withBody(
    { itemId: event.call_id, kind: "tool", title, status: event.status === "error" ? "failed" : event.status === "completed" ? "completed" : "inProgress" },
    json(event.result) ?? json(event.args),
  );
}

export function cursorThinkingToSessionItem(text: string, itemId: string): SessionItem {
  return { itemId, kind: "reasoning", title: "Reasoning", status: "inProgress", text };
}

type ClaudeStep = { item: SessionItem } | { text: string };
type ClaudeBlock = { type?: string; id?: string; name?: string; input?: Record<string, unknown>; tool_use_id?: string; content?: unknown; is_error?: boolean };

const str = (value: unknown) => (typeof value === "string" ? value : undefined);

/** Claude tool names → row title; the leading verb is what the UI classifies (read/edit/command/search). */
function claudeToolRow(name: string, input: Record<string, unknown> = {}) {
  const path = str(input.file_path) ?? str(input.notebook_path) ?? str(input.path);
  if (name === "Bash") return { title: `Run ${oneLine(str(input.command) ?? "")}`, head: `$ ${str(input.command) ?? ""}` };
  if (name === "Read") return { title: `Read ${path ?? ""}`.trim(), head: undefined };
  if (["Edit", "MultiEdit", "Write", "NotebookEdit"].includes(name)) return { title: `Edit ${path ?? ""}`.trim(), head: path };
  const query = str(input.pattern) ?? str(input.query) ?? str(input.url);
  if (["Grep", "Glob", "WebSearch", "WebFetch"].includes(name)) return { title: `Search ${oneLine(query ?? "")}`.trim(), head: undefined };
  return { title: query ? `${name} ${oneLine(query)}` : name, head: json(input) };
}

const resultText = (content: unknown) =>
  typeof content === "string"
    ? content
    : Array.isArray(content) ? content.map((part) => str((part as { text?: unknown }).text) ?? "").join("\n") : "";

/**
 * One `claude -p --output-format stream-json --verbose --include-partial-messages` line → chat steps.
 * `heads` remembers each tool's input summary so its result can be appended under it.
 */
export function claudeLineToSteps(line: unknown, heads: Map<string, string | undefined>, thoughts: { n: number; open: boolean }): ClaudeStep[] {
  const event = line as { type?: string; event?: { type?: string; content_block?: ClaudeBlock; delta?: { type?: string; text?: string; thinking?: string } }; message?: { content?: ClaudeBlock[] }; parent_tool_use_id?: string | null };
  if (event.type === "stream_event" && event.event) {
    const inner = event.event;
    const id = `thinking-${thoughts.n}`;
    if (inner.type === "content_block_start" && inner.content_block?.type === "thinking") {
      thoughts.open = true;
      return [{ item: { itemId: id, kind: "reasoning", title: "Reasoning", status: "inProgress" } }];
    }
    if (inner.type === "content_block_delta" && inner.delta?.type === "thinking_delta" && inner.delta.thinking) {
      return [{ item: { itemId: id, kind: "reasoning", title: "Reasoning", status: "inProgress", text: inner.delta.thinking } }];
    }
    if (inner.type === "content_block_delta" && inner.delta?.type === "text_delta" && inner.delta.text && !event.parent_tool_use_id) {
      return [{ text: inner.delta.text }];
    }
    if (inner.type === "content_block_stop" && thoughts.open) {
      thoughts.open = false;
      thoughts.n += 1;
      return [{ item: { itemId: id, kind: "reasoning", status: "completed" } }];
    }
    return [];
  }
  if (event.type === "assistant") {
    return (event.message?.content ?? []).flatMap((block): ClaudeStep[] => {
      if (block.type !== "tool_use" || !block.id || !block.name) return [];
      const { title, head } = claudeToolRow(block.name, block.input);
      heads.set(block.id, head);
      return [{ item: withBody({ itemId: block.id, kind: "tool", title, status: "inProgress" }, head) }];
    });
  }
  if (event.type === "user") {
    return (event.message?.content ?? []).flatMap((block): ClaudeStep[] => {
      if (block.type !== "tool_result" || !block.tool_use_id) return [];
      const body = [heads.get(block.tool_use_id), resultText(block.content).trimEnd()].filter(Boolean).join("\n");
      return [{ item: withBody({ itemId: block.tool_use_id, kind: "tool", status: block.is_error ? "failed" : "completed" }, body) }];
    });
  }
  return [];
}
