import { describe, expect, test } from "bun:test";
import { addUsage, isZeroUsage, subUsage, withTotal, ZERO_USAGE } from "./tokenUsage";

describe("tokenUsage", () => {
  test("add and sub", () => {
    const a = withTotal({ inputTokens: 10, outputTokens: 2, cacheReadTokens: 1, cacheWriteTokens: 0, reasoningTokens: 0 });
    const b = withTotal({ inputTokens: 3, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 2, reasoningTokens: 4, totalTokens: 10 });
    expect(addUsage(a, b)).toEqual({
      inputTokens: 13,
      outputTokens: 3,
      cacheReadTokens: 1,
      cacheWriteTokens: 2,
      reasoningTokens: 4,
      totalTokens: 22,
    });
    expect(subUsage(addUsage(a, b), a)).toEqual(b);
    expect(isZeroUsage(ZERO_USAGE)).toBe(true);
  });
});
