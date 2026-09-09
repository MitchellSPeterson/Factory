import { describe, expect, test } from "bun:test";
import { displayContextSegments } from "./contextSegments";
import { formatUsageIO } from "./formatTokens";

describe("formatUsageIO", () => {
  test("formats input and output", () => {
    expect(formatUsageIO({ inputTokens: 1200, outputTokens: 340 })).toBe("1.2k in · 340 out");
    expect(formatUsageIO({ inputTokens: 0, outputTokens: 0, totalTokens: 50 })).toBe("50");
    expect(formatUsageIO(null)).toBeNull();
  });
});

describe("displayContextSegments", () => {
  test("adds other context and output when usage exceeds estimates", () => {
    const segments = displayContextSegments(
      {
        estimated: true,
        segments: [
          { key: "instructions", label: "Instructions", tokens: 100 },
          { key: "request", label: "Request", tokens: 50 },
        ],
      },
      { inputTokens: 400, outputTokens: 80 },
    );
    expect(segments).toEqual([
      { key: "instructions", label: "Instructions", tokens: 100 },
      { key: "request", label: "Request", tokens: 50 },
      { key: "other", label: "Other context", tokens: 250 },
      { key: "output", label: "Output", tokens: 80 },
    ]);
  });
});
