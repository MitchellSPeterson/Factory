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
  if (resetsAt < now) {
    return `Reset ${formatDay(resetsAt)}`;
  }
  const remaining = resetsAt - now;
  if (remaining < 45_000) return "Resets soon";
  if (remaining < 60 * 60_000) {
    return `Resets in ${Math.max(1, Math.round(remaining / 60_000))}m`;
  }
  if (remaining < 24 * 60 * 60_000) {
    return `Resets in ${Math.max(1, Math.round(remaining / 3_600_000))}h`;
  }
  return `Resets ${formatDay(resetsAt)}`;
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

export const USAGE_FILL = {
  comfortable: "#3fb950",
  onTrack: "#58a6ff",
  approaching: "#d29922",
  overPace: "#e67e22",
  critical: "#f85149",
  exhausted: "#7B2FBE",
} as const;

export function paceRatio(
  percentUsed: number,
  now: number,
  resetsAt?: number,
  windowSeconds?: number,
): number | undefined {
  if (resetsAt === undefined || windowSeconds === undefined || windowSeconds <= 0) return undefined;
  const remainingSeconds = (resetsAt - now) / 1000;
  const elapsed = windowSeconds - remainingSeconds;
  if (elapsed <= 0) return undefined;
  const expected = (elapsed / windowSeconds) * 100;
  if (expected <= 0) return undefined;
  return percentUsed / expected;
}

export function paceLabel(
  percentUsed: number,
  now: number,
  resetsAt?: number,
  windowSeconds?: number,
): string | undefined {
  const ratio = paceRatio(percentUsed, now, resetsAt, windowSeconds);
  if (ratio === undefined) return undefined;
  if (ratio < 0.9) return "Under pace";
  if (ratio <= 1.1) return "On pace";
  return "Over pace";
}

export function usageFillColor(
  percentUsed: number,
  now: number,
  resetsAt?: number,
  windowSeconds?: number,
): string {
  const ratio = paceRatio(percentUsed, now, resetsAt, windowSeconds);
  if (ratio === undefined) {
    if (percentUsed < 70) return USAGE_FILL.comfortable;
    if (percentUsed < 90) return USAGE_FILL.onTrack;
    if (percentUsed < 100) return USAGE_FILL.approaching;
    if (percentUsed < 120) return USAGE_FILL.overPace;
    if (percentUsed < 160) return USAGE_FILL.critical;
    return USAGE_FILL.exhausted;
  }
  if (ratio < 0.7) return USAGE_FILL.comfortable;
  if (ratio < 0.9) return USAGE_FILL.onTrack;
  if (ratio < 1) return USAGE_FILL.approaching;
  if (ratio < 1.2) return USAGE_FILL.overPace;
  if (ratio < 1.6) return USAGE_FILL.critical;
  return USAGE_FILL.exhausted;
}

function formatDay(value: number): string {
  return new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function trimNumber(value: number): string {
  return value
    .toFixed(1)
    .replace(/\.0$/, "");
}
