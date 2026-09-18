import { expect, test } from "bun:test";
import {
  activitySummary,
  activityTitle,
  hasPendingPermission,
  humanizeToolTitle,
  permissionLabel,
  permissionVariant,
  selectedPermissionLabel,
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
  expect(activityTitle({ kind: "reasoning", text: "hmm" })).toBe("Thinking");
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
