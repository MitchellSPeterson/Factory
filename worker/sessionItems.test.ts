import { expect, test } from "bun:test";
import { claudeLineToSteps, codexItemToSessionItem, cursorToolToSessionItem } from "./sessionItems";

test("Codex command becomes a running then failed tool row", () => {
  const item = { id: "c1", type: "command_execution", command: "bun test\nmore", aggregated_output: "boom\n", exit_code: 1, status: "in_progress" } as const;
  expect(codexItemToSessionItem(item, false)).toMatchObject({ itemId: "c1", kind: "tool", title: "Run bun test", status: "inProgress", detail: "$ bun test\nmore\nboom" });
  expect(codexItemToSessionItem(item, true)?.status).toBe("failed");
});
test("Codex agent messages are not tool rows; Cursor tools name their target", () => {
  expect(codexItemToSessionItem({ id: "a", type: "agent_message", text: "hi" }, true)).toBeNull();
  expect(cursorToolToSessionItem({ type: "tool_call", agent_id: "a", run_id: "r", call_id: "t1", name: "read_file", status: "running", args: { path: "a.ts" } }))
    .toMatchObject({ itemId: "t1", title: "Read file a.ts", status: "inProgress" });
});

test("Claude stream-json: tool_use then tool_result, thinking closes only when open", () => {
  const heads = new Map<string, string | undefined>(), thoughts = { n: 0, open: false };
  const steps = (line: unknown) => claudeLineToSteps(line, heads, thoughts);
  expect(steps({ type: "stream_event", event: { type: "content_block_stop" } })).toEqual([]);
  expect(steps({ type: "stream_event", event: { type: "content_block_start", content_block: { type: "thinking" } } })).toHaveLength(1);
  expect(steps({ type: "stream_event", event: { type: "content_block_stop" } })).toEqual([{ item: { itemId: "thinking-0", kind: "reasoning", status: "completed" } }]);
  expect(steps({ type: "assistant", message: { content: [{ type: "tool_use", id: "t", name: "Bash", input: { command: "ls" } }] } }))
    .toMatchObject([{ item: { itemId: "t", title: "Run ls", status: "inProgress", detail: "$ ls" } }]);
  expect(steps({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t", content: "a\nb\n", is_error: false }] } }))
    .toMatchObject([{ item: { itemId: "t", status: "completed", detail: "$ ls\na\nb" } }]);
  expect(steps({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "hi" } } })).toEqual([{ text: "hi" }]);
});
