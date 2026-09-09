import { describe, expect, test } from "bun:test";
import { fromCodexUsage, fromCursorUsage, fromOpenAIUsage } from "./usage";

describe("usage converters", () => {
  test("Cursor", () => {
    expect(
      fromCursorUsage({
        inputTokens: 10,
        outputTokens: 4,
        cacheReadTokens: 2,
        cacheWriteTokens: 1,
        totalTokens: 15,
        reasoningTokens: 3,
      }),
    ).toEqual({
      inputTokens: 10,
      outputTokens: 4,
      cacheReadTokens: 2,
      cacheWriteTokens: 1,
      reasoningTokens: 3,
      totalTokens: 15,
    });
  });

  test("Codex", () => {
    expect(
      fromCodexUsage({
        input_tokens: 5,
        cached_input_tokens: 1,
        cache_write_input_tokens: 2,
        output_tokens: 3,
        reasoning_output_tokens: 1,
      }),
    ).toEqual({
      inputTokens: 5,
      outputTokens: 3,
      cacheReadTokens: 1,
      cacheWriteTokens: 2,
      reasoningTokens: 1,
      totalTokens: 10,
    });
  });

  test("OpenAI", () => {
    expect(
      fromOpenAIUsage({
        prompt_tokens: 8,
        completion_tokens: 2,
        total_tokens: 10,
        prompt_tokens_details: { cached_tokens: 3 },
        completion_tokens_details: { reasoning_tokens: 1 },
      }),
    ).toEqual({
      inputTokens: 8,
      outputTokens: 2,
      cacheReadTokens: 3,
      cacheWriteTokens: 0,
      reasoningTokens: 1,
      totalTokens: 10,
    });
  });
});
