import { describe, expect, test } from "bun:test";
import { laneOf } from "../convex/lib/jobState";
import { matchesProgress, parseLane, parseProgress } from "./jobsProgress";

describe("Jobs progress filter", () => {
  test("active hides Done (PR) and keeps the rest", () => {
    expect(matchesProgress("pr", "active")).toBe(false);
    expect(matchesProgress("queued", "active")).toBe(true);
    expect(matchesProgress("building", "active")).toBe(true);
    expect(matchesProgress("failed", "active")).toBe(true);
  });

  test("buckets map to Lanes", () => {
    expect(matchesProgress("queued", "queued")).toBe(true);
    expect(matchesProgress("planning", "inProgress")).toBe(true);
    expect(matchesProgress("building", "inProgress")).toBe(true);
    expect(matchesProgress("needsDetail", "attention")).toBe(true);
    expect(matchesProgress("pr", "done")).toBe(true);
    expect(matchesProgress(laneOf("done"), "done")).toBe(true);
  });

  test("parseProgress falls back to active", () => {
    expect(parseProgress("attention")).toBe("attention");
    expect(parseProgress("nope")).toBe("active");
    expect(parseProgress(null)).toBe("active");
  });

  test("parseLane accepts Factory lanes and failed", () => {
    expect(parseLane("planReview")).toBe("planReview");
    expect(parseLane("failed")).toBe("failed");
    expect(parseLane("column")).toBe("");
  });
});
