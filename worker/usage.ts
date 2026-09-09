import type { TokenUsage } from "../convex/lib/tokenUsage";
import { withTotal, ZERO_USAGE } from "../convex/lib/tokenUsage";

export type { TokenUsage };

export function fromCursorUsage(raw: {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
} | null | undefined): TokenUsage | null {
  if (!raw) return null;
  return withTotal({
    inputTokens: raw.inputTokens ?? 0,
    outputTokens: raw.outputTokens ?? 0,
    cacheReadTokens: raw.cacheReadTokens ?? 0,
    cacheWriteTokens: raw.cacheWriteTokens ?? 0,
    reasoningTokens: raw.reasoningTokens ?? 0,
    totalTokens: raw.totalTokens,
  });
}

export function fromCodexUsage(raw: {
  input_tokens?: number;
  cached_input_tokens?: number;
  cache_write_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
} | null | undefined): TokenUsage | null {
  if (!raw) return null;
  return withTotal({
    inputTokens: raw.input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
    cacheReadTokens: raw.cached_input_tokens ?? 0,
    cacheWriteTokens: raw.cache_write_input_tokens ?? 0,
    reasoningTokens: raw.reasoning_output_tokens ?? 0,
  });
}

export function fromOpenAIUsage(raw: {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
} | null | undefined): TokenUsage | null {
  if (!raw) return null;
  return withTotal({
    inputTokens: raw.prompt_tokens ?? 0,
    outputTokens: raw.completion_tokens ?? 0,
    cacheReadTokens: raw.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: 0,
    reasoningTokens: raw.completion_tokens_details?.reasoning_tokens ?? 0,
    totalTokens: raw.total_tokens,
  });
}

export { ZERO_USAGE };
