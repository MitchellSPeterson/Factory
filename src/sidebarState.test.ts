import { describe, expect, test } from "bun:test";
import { shouldToggleSidebarShortcut, sidebarModeFromStorage } from "./sidebarState";

describe("sidebarModeFromStorage", () => {
  test("reads only the two stored modes", () => {
    expect(sidebarModeFromStorage("collapsed")).toBe("collapsed");
    expect(sidebarModeFromStorage("expanded")).toBe("expanded");
    expect(sidebarModeFromStorage(null)).toBeNull();
    expect(sidebarModeFromStorage("true")).toBeNull();
  });
});

describe("shouldToggleSidebarShortcut", () => {
  const chord = { key: "b", metaKey: true, ctrlKey: false, repeat: false, defaultPrevented: false };

  test("toggles on meta/ctrl B", () => {
    expect(shouldToggleSidebarShortcut(chord)).toBe(true);
    expect(shouldToggleSidebarShortcut({ ...chord, metaKey: false, ctrlKey: true })).toBe(true);
  });

  test("ignores typing, repeats, and alt variants", () => {
    expect(shouldToggleSidebarShortcut({ ...chord, targetTag: "INPUT" })).toBe(false);
    expect(shouldToggleSidebarShortcut({ ...chord, targetTag: "TEXTAREA" })).toBe(false);
    expect(shouldToggleSidebarShortcut({ ...chord, contentEditable: true })).toBe(false);
    expect(shouldToggleSidebarShortcut({ ...chord, repeat: true })).toBe(false);
    expect(shouldToggleSidebarShortcut({ ...chord, altKey: true })).toBe(false);
    expect(shouldToggleSidebarShortcut({ ...chord, key: "k" })).toBe(false);
  });
});
