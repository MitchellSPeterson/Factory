import { expect, test } from "bun:test";
import { formatCheckedAt, formatPercent, formatReset, formatTokens, formatUsdCents, paceLabel, USAGE_FILL, usageFillColor } from "./format";

test("formatUsdCents uses currency with cents", () => {
  expect(formatUsdCents(4500)).toBe("$45.00");
  expect(formatUsdCents(12)).toBe("$0.12");
});

test("formatTokens uses compact counts", () => {
  expect(formatTokens(412)).toBe("412");
  expect(formatTokens(38_400)).toBe("38k");
  expect(formatTokens(1_200_000)).toBe("1.2M");
});

test("formatPercent rounds", () => {
  expect(formatPercent(35.6)).toBe("36%");
});

test("formatReset names nearby remaining time and later calendar days", () => {
  expect(formatReset(Date.UTC(2026, 8, 28), Date.UTC(2026, 8, 1))).toContain("Sep");
  expect(formatReset(Date.UTC(2026, 8, 28), Date.UTC(2026, 8, 1))).toMatch(/^Resets /);
  expect(formatReset(1_000 + 41 * 60_000, 1_000)).toBe("Resets in 41m");
});

test("formatCheckedAt stays relative", () => {
  expect(formatCheckedAt(1_000, 2_000)).toBe("Just checked");
  expect(formatCheckedAt(1_000, 1_000 + 5 * 60_000)).toBe("Checked 5m ago");
});

test("usageFillColor follows consumption pace through the window", () => {
  const now = 1_000;
  const windowSeconds = 10_000;
  expect(usageFillColor(5, now, now + 9_000 * 1000, windowSeconds)).toBe(USAGE_FILL.comfortable);
  expect(usageFillColor(95, now, now + 1_000 * 1000, windowSeconds)).toBe(USAGE_FILL.overPace);
  expect(usageFillColor(50, now)).toBe(USAGE_FILL.comfortable);
  expect(usageFillColor(95, now)).toBe(USAGE_FILL.approaching);
});

test("paceLabel compares usage with elapsed window time", () => {
  const hour = 3600;
  // Halfway through a 5h window.
  const now = 0;
  const resetsAt = 2.5 * hour * 1000;
  expect(paceLabel(20, now, resetsAt, 5 * hour)).toBe("Under pace");
  expect(paceLabel(50, now, resetsAt, 5 * hour)).toBe("On pace");
  expect(paceLabel(80, now, resetsAt, 5 * hour)).toBe("Over pace");
  expect(paceLabel(80, now)).toBeUndefined();
});
