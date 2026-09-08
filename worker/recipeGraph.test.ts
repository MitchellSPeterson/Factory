import { describe, expect, test } from "bun:test";
import {
  firstStage,
  nextStage,
  parseStageKey,
  placeStage,
  slugify,
  stageAgent,
  stageHalt,
  uniqueKey,
} from "../convex/lib/recipeGraph";

const feature = [
  { key: "plan", order: 0, halt: true },
  { key: "implement", order: 1, halt: false },
  { key: "verify", order: 2, halt: true },
  { key: "pr", order: 3, halt: false },
];

describe("recipe graph", () => {
  test("walks Feature in order", () => {
    expect(firstStage(feature)?.key).toBe("plan");
    expect(nextStage(feature, "plan")?.key).toBe("implement");
    expect(nextStage(feature, "implement")?.key).toBe("verify");
    expect(nextStage(feature, "verify")?.key).toBe("pr");
    expect(nextStage(feature, "pr")).toBeNull();
  });

  test("a deleted verify sends implement to PR", () => {
    const hotfix = feature.filter((s) => s.key !== "verify");
    expect(nextStage(hotfix, "implement")?.key).toBe("pr");
  });

  test("halt defaults match Feature keys", () => {
    expect(stageHalt({ key: "plan" })).toBe(true);
    expect(stageHalt({ key: "verify" })).toBe(true);
    expect(stageHalt({ key: "implement" })).toBe(false);
    expect(stageHalt({ key: "security-review", halt: true })).toBe(true);
    expect(stageHalt({ key: "plan", halt: false })).toBe(false);
  });

  test("placeStage reorders without losing nodes", () => {
    const moved = placeStage(feature, 1, 3);
    expect(moved.map((s) => s.key)).toEqual([
      "plan",
      "verify",
      "pr",
      "implement",
    ]);
  });

  test("keys stay slug-shaped and unique", () => {
    expect(slugify("Security Review")).toBe("security-review");
    expect(parseStageKey("Plan")).toBe("plan");
    expect(uniqueKey(["plan", "plan-2"], "Plan")).toBe("plan-3");
    expect(() => parseStageKey("2fast")).toThrow();
  });

  test("stage agent falls back to the Workflow", () => {
    expect(
      stageAgent({ model: "grok-4.6" }, { model: "composer-2.5", effort: "low" }),
    ).toEqual({ model: "grok-4.6", effort: "low" });
  });
});
