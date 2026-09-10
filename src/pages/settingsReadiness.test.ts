import { describe, expect, test } from "bun:test";
import {
  githubStatus,
  isSettingsTab,
  machineStatus,
  projectsStatus,
  sectionIdForTab,
} from "./settingsReadiness";

describe("isSettingsTab", () => {
  test("accepts the four Settings deep links", () => {
    expect(isSettingsTab("general")).toBe(true);
    expect(isSettingsTab("github")).toBe(true);
    expect(isSettingsTab("projects")).toBe(true);
    expect(isSettingsTab("providers")).toBe(true);
    expect(isSettingsTab("appearance")).toBe(false);
    expect(isSettingsTab(null)).toBe(false);
  });
});

describe("sectionIdForTab", () => {
  test("maps legacy tabs onto the single-page sections", () => {
    expect(sectionIdForTab("general")).toBe("appearance");
    expect(sectionIdForTab("github")).toBe("github");
    expect(sectionIdForTab("projects")).toBe("projects");
    expect(sectionIdForTab("providers")).toBe("providers");
    expect(sectionIdForTab(null)).toBeNull();
    expect(sectionIdForTab("nope")).toBeNull();
  });
});

describe("githubStatus", () => {
  test("treats a login as connected and a missing login as blocked", () => {
    expect(githubStatus(undefined).kind).toBe("unknown");
    expect(githubStatus(null)).toEqual({ kind: "blocked", label: "GitHub", detail: "Not connected" });
    expect(githubStatus("mitchell")).toEqual({ kind: "ready", label: "GitHub", detail: "@mitchell · connected" });
  });
});

describe("machineStatus", () => {
  test("reports unpaired, offline, and online without mixing those states", () => {
    expect(machineStatus({ name: undefined, online: false }).kind).toBe("unknown");
    expect(machineStatus({ name: null, online: false })).toEqual({
      kind: "blocked",
      label: "This machine",
      detail: "Not paired",
    });
    expect(machineStatus({ name: "Factory-MBP", online: false })).toEqual({
      kind: "blocked",
      label: "This machine",
      detail: "Offline",
    });
    expect(machineStatus({ name: "Factory-MBP", online: true })).toEqual({
      kind: "ready",
      label: "This machine",
      detail: "Online",
    });
  });
});

describe("projectsStatus", () => {
  test("counts Projects in Factory language", () => {
    expect(projectsStatus(undefined).kind).toBe("unknown");
    expect(projectsStatus(0)).toEqual({ kind: "blocked", label: "Projects", detail: "None yet" });
    expect(projectsStatus(1)).toEqual({ kind: "ready", label: "Projects", detail: "1 ready" });
    expect(projectsStatus(3)).toEqual({ kind: "ready", label: "Projects", detail: "3 ready" });
  });
});
