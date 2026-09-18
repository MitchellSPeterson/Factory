import { expect, test } from "bun:test";
import { formatCheckedAt, formatPercent, formatReset, formatTokens, formatUsdCents } from "./format";

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

test("formatReset names the calendar day", () => {
  expect(formatReset(Date.UTC(2026, 8, 28), Date.UTC(2026, 8, 1))).toContain("Sep");
  expect(formatReset(Date.UTC(2026, 8, 28), Date.UTC(2026, 8, 1))).toMatch(/^Resets /);
});

test("formatCheckedAt stays relative", () => {
  expect(formatCheckedAt(1_000, 2_000)).toBe("Just checked");
  expect(formatCheckedAt(1_000, 1_000 + 5 * 60_000)).toBe("Checked 5m ago");
});
