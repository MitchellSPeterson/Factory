import { expect, test } from "bun:test";
import { grokAcpSpawnArgs, grokEffortToken, parseGenericCliVersion, parseGrokModelsCliOutput, sessionUpdateToItem } from "./grokAcp";

test("Grok ACP spawn args map Factory permission modes onto the CLI", () => {
  expect(grokAcpSpawnArgs("supervised")).toEqual(["--permission-mode", "default", "agent", "stdio"]);
  expect(grokAcpSpawnArgs("auto-accept-edits")).toEqual(["--permission-mode", "acceptEdits", "agent", "stdio"]);
  expect(grokAcpSpawnArgs("auto")).toEqual(["--permission-mode", "auto", "agent", "stdio"]);
  expect(grokAcpSpawnArgs("full-access")).toEqual(["agent", "--always-approve", "stdio"]);
});

test("Grok models CLI output is the catalog, not a hardcoded list", () => {
  const parsed = parseGrokModelsCliOutput(`
You are logged in with grok.com.
Default model: grok-4.6
Available models:
  * grok-4.6 (default)
  - grok-4.5
`);
  expect(parsed.authenticated).toBe(true);
  expect(parsed.models).toEqual([
    { slug: "grok-4.6", name: "Grok 4.6", isDefault: true },
    { slug: "grok-4.5", name: "Grok 4.5" },
  ]);
  expect(parseGrokModelsCliOutput("Not authenticated. Run grok login.").authenticated).toBe(false);
  expect(parseGenericCliVersion("grok 1.2.3")).toBe("1.2.3");
  expect(grokEffortToken("ultra")).toBe("max");
});

test("ACP session updates become text, tools, or reasoning items", () => {
  expect(sessionUpdateToItem({
    update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello" } },
  })).toEqual({ kind: "text", text: "Hello" });
  expect(sessionUpdateToItem({
    update: { sessionUpdate: "tool_call", toolCallId: "call_1", title: "Read file", kind: "read", status: "in_progress" },
  })).toEqual({
    itemId: "call_1",
    kind: "tool",
    title: "Read file",
    status: "inProgress",
  });
  expect(sessionUpdateToItem({
    update: { sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "hmm" } },
  })).toEqual({
    itemId: "reasoning",
    kind: "reasoning",
    title: "Reasoning",
    status: "inProgress",
    text: "hmm",
  });
});

test("tool calls keep a real name and do not fall back to Tool", () => {
  expect(sessionUpdateToItem({
    update: {
      sessionUpdate: "tool_call",
      toolCallId: "call_2",
      title: "graft__graft_find_code",
      status: "in_progress",
    },
  })).toEqual({
    itemId: "call_2",
    kind: "tool",
    title: "graft_find_code",
    status: "inProgress",
  });
  expect(sessionUpdateToItem({
    update: {
      sessionUpdate: "tool_call",
      toolCallId: "call_3",
      kind: "read",
      status: "in_progress",
      locations: [{ path: "expo/src/chats/Conversation.tsx" }],
    },
  })).toEqual({
    itemId: "call_3",
    kind: "tool",
    title: "Read Conversation.tsx",
    detail: "expo/src/chats/Conversation.tsx",
    text: "expo/src/chats/Conversation.tsx",
    status: "inProgress",
  });
  expect(sessionUpdateToItem({
    update: {
      sessionUpdate: "tool_call_update",
      toolCallId: "call_1",
      status: "completed",
    },
  })).toEqual({
    itemId: "call_1",
    kind: "tool",
    status: "completed",
  });
  expect(sessionUpdateToItem({
    update: {
      sessionUpdate: "tool_call_update",
      toolCallId: "call_1",
      content: [{ type: "content", content: { type: "text", text: "ok" } }],
    },
  })).toEqual({
    itemId: "call_1",
    kind: "tool",
    detail: "ok",
    text: "ok",
  });
  expect(sessionUpdateToItem({
    update: {
      sessionUpdate: "tool_call",
      toolCallId: "call_4",
      kind: "execute",
      status: "in_progress",
      rawInput: { command: "bunx tsc --noEmit -p expo/tsconfig.json" },
    },
  })).toEqual({
    itemId: "call_4",
    kind: "tool",
    title: "Command",
    detail: "bunx tsc --noEmit -p expo/tsconfig.json",
    text: "bunx tsc --noEmit -p expo/tsconfig.json",
    status: "inProgress",
  });
});
