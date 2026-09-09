/** Compact token count for Job cards and dashboards. */
export function formatTokens(n: number | undefined | null): string {
  if (n === undefined || n === null) return "—";
  if (n < 1_000) return String(Math.round(n));
  if (n < 1_000_000) {
    const k = n / 1_000;
    return `${k < 10 ? k.toFixed(1) : Math.round(k)}k`;
  }
  return `${(n / 1_000_000).toFixed(1)}M`;
}

export type UsageLike = {
  inputTokens: number;
  outputTokens: number;
  totalTokens?: number;
};

/** "12.4k in · 1.2k out" — falls back to total when only total is meaningful. */
export function formatUsageIO(usage: UsageLike | null | undefined): string | null {
  if (!usage) return null;
  if (usage.inputTokens === 0 && usage.outputTokens === 0) {
    return usage.totalTokens ? formatTokens(usage.totalTokens) : null;
  }
  return `${formatTokens(usage.inputTokens)} in · ${formatTokens(usage.outputTokens)} out`;
}
