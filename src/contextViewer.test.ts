import { describe, expect, test } from "bun:test";
import {
  contextFill,
  displayContextSegments,
  latestAgentContext,
  modelContextWindow,
} from "./contextSegments";
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

describe("latestAgentContext", () => {
  test("uses the last Run that has context, not every Run", () => {
    const runs = [
      { usage: { inputTokens: 10, outputTokens: 1 } },
      {},
      { contextBreakdown: { estimated: true, segments: [{ key: "request", label: "Request", tokens: 40 }] } },
    ];
    expect(latestAgentContext(runs)?.contextBreakdown?.segments[0]?.tokens).toBe(40);
    expect(latestAgentContext([{}, {}])).toBeNull();
  });
});

describe("modelContextWindow", () => {
  test("maps known families and defaults to 256k", () => {
    expect(modelContextWindow("claude-opus-5-thinking-high")).toBe(200_000);
    expect(modelContextWindow("grok-4.6")).toBe(256_000);
    expect(modelContextWindow("composer-2.5")).toBe(256_000);
    expect(modelContextWindow(undefined)).toBe(256_000);
  });
});

describe("contextFill", () => {
  test("caps at the window", () => {
    expect(contextFill(128_000, 256_000)).toBe(0.5);
    expect(contextFill(300_000, 256_000)).toBe(1);
    expect(contextFill(0, 256_000)).toBe(0);
  });
});
