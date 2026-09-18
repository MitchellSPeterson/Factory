import { expect, test } from "bun:test";
import { DEFAULT_CHAT_SETTINGS } from "./lastSettings";
import { applyPickerChoice, pickerChoices, pickerOptionRows } from "./modelOptions";

test("Codex shows reasoning, service tier, and runtime", () => {
  expect(pickerOptionRows(DEFAULT_CHAT_SETTINGS).map((row) => row.id)).toEqual([
    "effort",
    "service",
    "runtime",
  ]);
  expect(pickerOptionRows(DEFAULT_CHAT_SETTINGS).map((row) => row.valueLabel)).toEqual([
    "Medium",
    "Standard",
    "Supervised",
  ]);
});

test("Grok and Cursor hide Codex service tier", () => {
  expect(
    pickerOptionRows({
      ...DEFAULT_CHAT_SETTINGS,
      provider: "grok",
      model: "grok-4.6",
    }).map((row) => row.id),
  ).toEqual(["effort", "runtime"]);
  expect(
    pickerOptionRows({
      ...DEFAULT_CHAT_SETTINGS,
      provider: "cursor",
      model: "composer-2.5",
    }).map((row) => row.id),
  ).toEqual(["effort", "runtime"]);
});

test("applyPickerChoice updates the matching setting", () => {
  const next = applyPickerChoice(DEFAULT_CHAT_SETTINGS, "runtime", "full-access");
  expect(next.permissionMode).toBe("full-access");
  expect(applyPickerChoice(next, "service", "flex").serviceTier).toBe("flex");
  expect(applyPickerChoice(next, "effort", "high").effort).toBe("high");
  expect(applyPickerChoice(next, "effort", "ludicrous")).toEqual(next);
});

test("pickerChoices lists runtime access modes", () => {
  expect(pickerChoices("runtime").title).toBe("Runtime");
  expect(pickerChoices("runtime").choices.map((choice) => choice.id)).toEqual([
    "supervised",
    "auto-accept-edits",
    "auto",
    "full-access",
  ]);
  expect(pickerChoices("service").title).toBe("Service Tier");
  expect(pickerChoices("service").choices.map((choice) => choice.label)).toEqual([
    "Standard",
    "Flex",
    "Priority",
  ]);
});
