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
