import { describe, expect, test } from "bun:test";
import {
  compareJobs,
  doneNudgeLabel,
  formatJobAge,
  jobsHeadline,
  shouldShowStage,
  stageTitle,
} from "./jobsBoard";

describe("jobsHeadline", () => {
  test("loading names the current scope", () => {
    expect(
      jobsHeadline({ loading: true, visibleCount: 0, scopedCount: 0, attentionCount: 0, scope: "all" }),
    ).toBe("View all Jobs across Projects.");
    expect(
      jobsHeadline({ loading: true, visibleCount: 0, scopedCount: 0, attentionCount: 0, scope: "project" }),
    ).toBe("Jobs in this Project.");
  });

  test("counts Jobs and who needs you", () => {
    expect(
      jobsHeadline({ loading: false, visibleCount: 4, scopedCount: 4, attentionCount: 3, scope: "all" }),
    ).toBe("4 Jobs in View all. 3 need you.");
    expect(
      jobsHeadline({ loading: false, visibleCount: 1, scopedCount: 1, attentionCount: 1, scope: "project" }),
    ).toBe("1 Job in this Project needs you.");
    expect(
      jobsHeadline({ loading: false, visibleCount: 2, scopedCount: 2, attentionCount: 0, scope: "all" }),
    ).toBe("2 Jobs in View all.");
    expect(
      jobsHeadline({ loading: false, visibleCount: 0, scopedCount: 0, attentionCount: 0, scope: "all" }),
    ).toBe("No Jobs in View all.");
    expect(
      jobsHeadline({ loading: false, visibleCount: 0, scopedCount: 4, attentionCount: 0, scope: "all" }),
    ).toBe("None of 4 Jobs in View all match.");
  });
});

describe("compareJobs", () => {
  test("puts attention Lanes before the rest, then newest first", () => {
    const rows = [
      { lane: "planning" as const, createdAt: 30 },
      { lane: "planReview" as const, createdAt: 10 },
      { lane: "failed" as const, createdAt: 20 },
      { lane: "building" as const, createdAt: 40 },
    ];
    expect([...rows].sort(compareJobs).map((row) => `${row.lane}:${row.createdAt}`)).toEqual([
      "failed:20",
      "planReview:10",
      "building:40",
      "planning:30",
    ]);
  });

  test("keeps in-progress Jobs above Done", () => {
    const rows = [
      { lane: "pr" as const, createdAt: 50 },
      { lane: "planning" as const, createdAt: 10 },
      { lane: "codeReview" as const, createdAt: 5 },
    ];
    expect([...rows].sort(compareJobs).map((row) => row.lane)).toEqual([
      "codeReview",
      "planning",
      "pr",
    ]);
  });
});

describe("shouldShowStage", () => {
  test("hides a Stage already named by the Lane", () => {
    expect(shouldShowStage("plan", "planReview")).toBe(false);
    expect(shouldShowStage("planning", "planning")).toBe(false);
    expect(shouldShowStage("implement", "building")).toBe(true);
    expect(shouldShowStage("verify", "building")).toBe(true);
  });
});

describe("stageTitle", () => {
  test("splits camel and kebab keys", () => {
    expect(stageTitle("planReview")).toBe("plan Review");
    expect(stageTitle("needs-grilling")).toBe("needs grilling");
  });
});

describe("formatJobAge", () => {
  test("uses Today, Yesterday, then a short date", () => {
    const now = Date.parse("2026-09-09T18:00:00");
    expect(formatJobAge(Date.parse("2026-09-09T08:00:00"), now)).toBe("Today");
    expect(formatJobAge(Date.parse("2026-09-08T22:00:00"), now)).toBe("Yesterday");
    expect(formatJobAge(Date.parse("2026-09-03T12:00:00"), now)).toBe("Sep 3");
    expect(formatJobAge(Date.parse("2025-12-01T12:00:00"), now)).toMatch(/Dec 1/);
  });
});

describe("doneNudgeLabel", () => {
  test("is empty when nothing is hidden", () => {
    expect(doneNudgeLabel(0)).toBe("");
    expect(doneNudgeLabel(1)).toBe("Show 1 Done");
    expect(doneNudgeLabel(7)).toBe("Show 7 Done");
  });
});
