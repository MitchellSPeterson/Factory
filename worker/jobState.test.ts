import { describe, expect, test } from "bun:test";
import { toModelSelection } from "../convex/lib/agentModel";
import {
  assertTransition,
  canTransition,
  laneOf,
  largeAndThinSpec,
  parsePlanVerdict,
} from "../convex/lib/jobState";

describe("job transitions", () => {
  test("plan cannot skip plan review", () => {
    expect(canTransition("planning", "building")).toBe(false);
    expect(canTransition("planning", "planReview")).toBe(true);
    expect(canTransition("planReview", "building")).toBe(true);
  });

  test("grill sits in needsDetail then returns to planning", () => {
    expect(canTransition("planning", "needsDetail")).toBe(true);
    expect(canTransition("needsDetail", "planning")).toBe(true);
  });

  test("building waits for code review before PR", () => {
    expect(canTransition("building", "pr")).toBe(false);
    expect(canTransition("building", "codeReview")).toBe(true);
    expect(canTransition("codeReview", "pr")).toBe(true);
  });

  test("queued is the first lane", () => {
    expect(canTransition("queued", "planning")).toBe(true);
    expect(canTransition("queued", "needsDetail")).toBe(true);
  });

  test("pr and failed are terminal enough", () => {
    expect(canTransition("pr", "planning")).toBe(false);
    expect(canTransition("failed", "planning")).toBe(false);
    expect(() => assertTransition("failed", "pr")).toThrow();
  });

  test("legacy statuses map onto lanes", () => {
    expect(laneOf("awaitingAsk")).toBe("needsDetail");
    expect(laneOf("awaitingSpec")).toBe("planReview");
    expect(laneOf("implementing")).toBe("building");
    expect(laneOf("verifying")).toBe("building");
    expect(laneOf("openingPr")).toBe("pr");
    expect(laneOf("done")).toBe("pr");
  });
});

describe("largeAndThinSpec", () => {
  test("force grill wins", () => {
    expect(largeAndThinSpec(true, null)).toBe(true);
    expect(largeAndThinSpec(true, { size: "small", specQuality: "enough" })).toBe(
      true,
    );
  });

  test("needs a large thin verdict", () => {
    expect(largeAndThinSpec(false, null)).toBe(false);
    expect(largeAndThinSpec(false, { size: "large", specQuality: "enough" })).toBe(
      false,
    );
    expect(largeAndThinSpec(false, { size: "small", specQuality: "thin" })).toBe(
      false,
    );
    expect(largeAndThinSpec(false, { size: "large", specQuality: "thin" })).toBe(
      true,
    );
  });

  test("parse rejects junk", () => {
    expect(parsePlanVerdict("nope")).toBeNull();
    expect(parsePlanVerdict(JSON.stringify({ size: "large" }))).toBeNull();
    expect(
      parsePlanVerdict(JSON.stringify({ size: "large", specQuality: "thin" })),
    ).toEqual({ size: "large", specQuality: "thin" });
  });
});

describe("toModelSelection", () => {
  test("medium keeps today's composer default", () => {
    expect(toModelSelection("composer-2.5", "medium")).toEqual({
      id: "composer-2.5",
    });
  });

  test("low maps composer to fast", () => {
    expect(toModelSelection("composer-2.5", "low")).toEqual({
      id: "composer-2.5",
      params: [{ id: "fast", value: "true" }],
    });
  });

  test("auto-smart uses optimize_for", () => {
    expect(toModelSelection("auto-smart", "low")).toEqual({
      id: "auto-smart",
      params: [{ id: "optimize_for", value: "speed" }],
    });
    expect(toModelSelection("auto-smart", "medium")).toEqual({
      id: "auto-smart",
      params: [{ id: "optimize_for", value: "balanced" }],
    });
    expect(toModelSelection("auto-smart", "high")).toEqual({
      id: "auto-smart",
      params: [{ id: "optimize_for", value: "quality" }],
    });
  });

  test("high effort is reasoning_effort", () => {
    expect(toModelSelection("grok-4.6", "high")).toEqual({
      id: "grok-4.6",
      params: [{ id: "reasoning_effort", value: "high" }],
    });
  });
});
