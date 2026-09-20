export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  totalTokens: number;
};

export const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
};

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

export function subUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    inputTokens: a.inputTokens - b.inputTokens,
    outputTokens: a.outputTokens - b.outputTokens,
    cacheReadTokens: a.cacheReadTokens - b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens - b.cacheWriteTokens,
    reasoningTokens: a.reasoningTokens - b.reasoningTokens,
    totalTokens: a.totalTokens - b.totalTokens,
  };
}

export function isZeroUsage(u: TokenUsage): boolean {
  return (
    u.inputTokens === 0 &&
    u.outputTokens === 0 &&
    u.cacheReadTokens === 0 &&
    u.cacheWriteTokens === 0 &&
    u.reasoningTokens === 0 &&
    u.totalTokens === 0
  );
}

/** Prefer reported total; otherwise sum input+output+cache write (cache read is usually already in input). */
export function withTotal(partial: Omit<TokenUsage, "totalTokens"> & { totalTokens?: number }): TokenUsage {
  const totalTokens =
    partial.totalTokens ??
    partial.inputTokens + partial.outputTokens + partial.cacheWriteTokens;
  return { ...partial, totalTokens, reasoningTokens: partial.reasoningTokens };
}
