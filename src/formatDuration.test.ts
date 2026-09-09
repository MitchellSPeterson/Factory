import { describe, expect, test } from "bun:test";
import { formatDuration, jobDurationMs, runDurationMs } from "./formatDuration";

describe("formatDuration", () => {
  test("formats compact spans", () => {
    expect(formatDuration(500)).toBe("<1s");
    expect(formatDuration(12_000)).toBe("12s");
    expect(formatDuration(125_000)).toBe("2m 5s");
    expect(formatDuration(3_600_000)).toBe("1h");
    expect(formatDuration(90_000_000)).toBe("1d 1h");
  });
});

describe("duration rollups", () => {
  test("runDurationMs prefers stored duration", () => {
    expect(runDurationMs({ startedAt: 1_000, durationMs: 5_000 }, 9_000)).toBe(5_000);
    expect(runDurationMs({ startedAt: 1_000 }, 4_000)).toBe(3_000);
  });

  test("jobDurationMs adds live Runs on top of stored total", () => {
    expect(
      jobDurationMs(
        { durationMs: 10_000 },
        [
          { durationMs: 10_000, endedAt: 11_000, startedAt: 1_000 },
          { startedAt: 20_000 },
        ],
        25_000,
      ),
    ).toBe(15_000);
  });
});
