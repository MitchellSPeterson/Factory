import { expect, test } from "bun:test";
import {
  activitySummary,
  activityTitle,
  groupChatFeed,
  hasLiveTool,
  hasPendingPermission,
  humanizeToolTitle,
  liveWorkLabel,
  permissionLabel,
  permissionVariant,
  selectedPermissionLabel,
  shouldShowThinkingRow,
  summarizeToolGroup,
  toolAction,
  workRowLabel,
} from "./activity";

test("humanizeToolTitle strips MCP server prefixes and dummy Tool labels", () => {
  expect(humanizeToolTitle("graft__graft_find_code")).toBe("graft_find_code");
  expect(humanizeToolTitle("Read file")).toBe("Read file");
  expect(humanizeToolTitle("Tool")).toBe("");
  expect(humanizeToolTitle(undefined)).toBe("");
});

test("activityTitle falls back by kind", () => {
  expect(activityTitle({ kind: "tool", text: "" })).toBe("Tool");
  expect(activityTitle({ kind: "tool", title: "graft__graft_find_all", text: "" })).toBe(
    "graft_find_all",
  );
  expect(activityTitle({ kind: "permission", text: "" })).toBe("Approval needed");
  expect(activityTitle({ kind: "reasoning", text: "hmm" })).toBe("Thought");
  expect(activityTitle({ kind: "reasoning", text: "hmm", status: "inProgress" })).toBe("Thinking");
});

test("activitySummary is the first detail line when it adds information", () => {
  expect(
    activitySummary({
      kind: "tool",
      title: "Read",
      text: "expo/src/chats/Conversation.tsx",
    }),
  ).toBe("expo/src/chats/Conversation.tsx");
  expect(
    activitySummary({
      kind: "tool",
      title: "Read file",
      text: "Read file",
    }),
  ).toBeUndefined();
});

test("permission labels and variants match T3 Code actions", () => {
  expect(permissionLabel("always allow")).toBe("Always allow");
  expect(permissionLabel("allow_once")).toBe("Allow once");
  expect(permissionVariant({ optionId: "a", name: "always allow", kind: "allow_always" })).toBe(
    "allow-always",
  );
  expect(permissionVariant({ optionId: "b", name: "allow once" })).toBe("allow-once");
  expect(permissionVariant({ optionId: "c", name: "reject once", kind: "reject_once" })).toBe(
    "reject",
  );
});

test("pending permission is detected so the working row can hide", () => {
  expect(
    hasPendingPermission([
      { kind: "tool", title: "graft_find_code", text: "", status: "completed" },
      {
        kind: "permission",
        title: "graft_find_all",
        text: "",
        status: "pending",
        options: [{ optionId: "allow-once", name: "allow once" }],
      },
    ]),
  ).toBe(true);
  expect(
    hasPendingPermission([
      {
        kind: "permission",
        text: "",
        status: "resolved",
        decision: "allow-once",
      },
    ]),
  ).toBe(false);
});

test("selected permission label uses the chosen option", () => {
  expect(
    selectedPermissionLabel({
      kind: "permission",
      text: "",
      status: "resolved",
      decision: "allow-once",
      options: [
        { optionId: "allow-once", name: "allow once" },
        { optionId: "reject-once", name: "reject once" },
      ],
    }),
  ).toBe("Allow once");
});

test("toolAction classifies titles the way T3 groups them", () => {
  expect(toolAction({ kind: "tool", title: "Read Conversation.tsx", text: "" })).toBe("read");
  expect(toolAction({ kind: "tool", title: "Edit activity.ts", text: "" })).toBe("edit");
  expect(toolAction({ kind: "tool", title: "Command", text: "bun test" })).toBe("command");
  expect(toolAction({ kind: "tool", title: "graft_find_code", text: "" })).toBe("search");
  expect(toolAction({ kind: "tool", title: "web_fetch", text: "" })).toBe("other");
});

test("summarizeToolGroup condenses consecutive tools into one line", () => {
  expect(
    summarizeToolGroup([
      { kind: "tool", title: "Read a.ts", text: "" },
      { kind: "tool", title: "Read b.ts", text: "" },
    ]),
  ).toBe("Read 2 files");
  expect(
    summarizeToolGroup([
      { kind: "tool", title: "Edit a.ts", text: "" },
      { kind: "tool", title: "Read b.ts", text: "" },
      { kind: "tool", title: "Command", text: "bun test" },
    ]),
  ).toBe("Read 1 file, changed 1 file, and ran 1 command");
  expect(summarizeToolGroup([{ kind: "tool", title: "Read Conversation.tsx", text: "" }])).toBe(
    "Read Conversation.tsx",
  );
  expect(summarizeToolGroup([{ kind: "tool", title: "Edit activity.ts", text: "" }])).toBe(
    "Changed 1 file",
  );
});

test("liveWorkLabel prefers the in-progress tool", () => {
  expect(
    liveWorkLabel([
      { kind: "tool", title: "Read a.ts", text: "", status: "completed" },
      { kind: "tool", title: "graft_find_code", text: "", status: "inProgress" },
    ]),
  ).toBe("graft_find_code");
});

test("groupChatFeed collapses adjacent tools and keeps permissions standalone", () => {
  const rows = groupChatFeed([
    { _id: "u1", kind: "message", role: "user", text: "hi" },
    { _id: "t1", kind: "tool", title: "Read a.ts", text: "" },
    { _id: "t2", kind: "tool", title: "Read b.ts", text: "" },
    { _id: "r1", kind: "reasoning", text: "checking" },
    { _id: "p1", kind: "permission", title: "graft_find_all", text: "", status: "pending" },
    { _id: "a1", kind: "message", role: "assistant", text: "done" },
  ]);
  expect(rows.map((row) => row.type)).toEqual([
    "message",
    "work",
    "permission",
    "message",
  ]);
  expect(rows[1]).toMatchObject({
    type: "work",
    id: "t1",
    messages: [{ _id: "t1" }, { _id: "t2" }, { _id: "r1" }],
  });
});

test("thinking row hides while a tool is running or approval is pending", () => {
  const tools = [
    { kind: "tool" as const, title: "Read a.ts", text: "", status: "completed" },
    { kind: "tool" as const, title: "Read b.ts", text: "", status: "inProgress" },
  ];
  expect(hasLiveTool(tools)).toBe(true);
  expect(
    shouldShowThinkingRow({
      busy: true,
      queued: false,
      awaitingApproval: false,
      messages: tools,
    }),
  ).toBe(false);
  expect(
    shouldShowThinkingRow({
      busy: true,
      queued: false,
      awaitingApproval: false,
      messages: [tools[0]!],
    }),
  ).toBe(true);
  expect(
    shouldShowThinkingRow({
      busy: true,
      queued: false,
      awaitingApproval: true,
      messages: [tools[0]!],
    }),
  ).toBe(false);
  expect(
    shouldShowThinkingRow({
      busy: true,
      queued: false,
      awaitingApproval: false,
      messages: [{ kind: "reasoning", text: "hmm", status: "inProgress" }],
    }),
  ).toBe(false);
});

test("workRowLabel uses the tool title", () => {
  expect(workRowLabel({ kind: "tool", title: "Read Conversation.tsx", text: "path" })).toBe(
    "Read Conversation.tsx",
  );
  expect(workRowLabel({ kind: "reasoning", text: "hmm" })).toBe("Thought");
});
