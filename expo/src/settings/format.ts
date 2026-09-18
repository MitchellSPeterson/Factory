export function formatUsdCents(cents: number): string {
  const dollars = cents / 100;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

export function formatTokens(count: number): string {
  const abs = Math.abs(count);
  if (abs >= 1_000_000) {
    const value = count / 1_000_000;
    return `${trimNumber(value)}M`;
  }
  if (abs >= 10_000) {
    return `${Math.round(count / 1_000)}k`;
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(count);
}

export function formatPercent(value: number): string {
  const rounded = Math.round(value);
  return `${rounded}%`;
}

export function formatReset(resetsAt: number, now: number): string {
  const date = new Date(resetsAt);
  const formatted = date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return resetsAt < now ? `Reset ${formatted}` : `Resets ${formatted}`;
}

export function formatCheckedAt(checkedAt: number, now: number): string {
  const delta = Math.max(0, now - checkedAt);
  if (delta < 45_000) return "Just checked";
  if (delta < 60_000) return "Checked less than a minute ago";
  const minutes = Math.round(delta / 60_000);
  if (minutes < 60) return `Checked ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `Checked ${hours}h ago`;
}

function trimNumber(value: number): string {
  return value
    .toFixed(1)
    .replace(/\.0$/, "");
}
