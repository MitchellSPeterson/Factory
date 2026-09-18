import { expect, test } from "bun:test";
import {
  collectProviderUsage,
  parseCursorPeriod,
  parseOpenAICosts,
  parseOpenAICredits,
  parseXaiPrepaid,
  parseXaiTeamId,
  percentUsed,
  type HttpFetch,
} from "./providerUsage";

test("percentUsed accepts 0-1 fractions and 0-100 percents", () => {
  expect(percentUsed(36, 100, 0.36)).toBe(36);
  expect(percentUsed(36, 100, 36)).toBe(36);
  expect(percentUsed(25, 50)).toBe(50);
  expect(percentUsed(undefined, 50)).toBeUndefined();
});

test("Cursor current-period usage maps remaining cents and reset time", () => {
  const meter = parseCursorPeriod(
    {
      billingCycleEnd: "1784958141000",
      displayMessage: "You've used 36% of your included usage",
      planUsage: { totalSpend: 2500, remaining: 4500, limit: 7000, totalPercentUsed: 36 },
    },
    1,
    "Pro+",
  );
  expect(meter).toEqual({
    provider: "cursor",
    status: "ok",
    checkedAt: 1,
    plan: "Pro+",
    usedCents: 2500,
    remainingCents: 4500,
    limitCents: 7000,
    percentUsed: 36,
    resetsAt: 1784958141000,
    display: "You've used 36% of your included usage",
  });
});

test("OpenAI credit grants convert dollars to cents", () => {
  const meter = parseOpenAICredits(
    {
      total_granted: 120,
      total_used: 45.5,
      total_available: 74.5,
      grants: { data: [{ expires_at: 2_000_000_000 }] },
    },
    1_000,
    "openai",
  );
  expect(meter).toMatchObject({
    provider: "openai",
    status: "ok",
    remainingCents: 7450,
    usedCents: 4550,
    limitCents: 12000,
    resetsAt: 2_000_000_000_000,
  });
});

test("OpenAI organization costs sum spend when remaining is unavailable", () => {
  const meter = parseOpenAICosts(
    {
      data: [
        { results: [{ amount: { value: 0.06, currency: "usd" } }] },
        { results: [{ amount: { value: 1.2, currency: "usd" } }] },
      ],
    },
    1,
    "codex",
  );
  expect(meter).toMatchObject({ provider: "codex", status: "ok", usedCents: 126 });
});

test("xAI prepaid balance is remaining cents", () => {
  expect(parseXaiTeamId({ teamId: "team-1" })).toBe("team-1");
  expect(parseXaiPrepaid({ total: { val: "2500" } }, 1, "grok")).toMatchObject({
    provider: "grok",
    remainingCents: 2500,
  });
});

test("collectProviderUsage reports every provider without calling the network when keys are missing", async () => {
  const report = await collectProviderUsage({
    env: {},
    now: 10,
    grokCatalog: { checkedAt: 10, installed: false, models: [] },
    http: async () => {
      throw new Error("network should not run");
    },
  });
  expect(report.meters.map((meter) => meter.provider)).toEqual(["cursor", "codex", "grok", "openai"]);
  expect(report.meters.every((meter) => meter.status === "unconfigured")).toBe(true);
});

test("collectProviderUsage reads Cursor remaining from DashboardService", async () => {
  const http: HttpFetch = async (url) => {
    if (url.includes("exchange_user_api_key")) {
      return new Response(JSON.stringify({ accessToken: "tok" }), { status: 200 });
    }
    if (url.includes("GetPlanInfo")) {
      return new Response(JSON.stringify({ planInfo: { planName: "Pro" } }), { status: 200 });
    }
    if (url.includes("GetCurrentPeriodUsage")) {
      return new Response(JSON.stringify({ planUsage: { remaining: 1200, limit: 2000, totalSpend: 800 } }), { status: 200 });
    }
    return new Response("missing", { status: 404 });
  };
  const report = await collectProviderUsage({ env: { CURSOR_API_KEY: "crsr_test" }, now: 5, http });
  const cursor = report.meters.find((meter) => meter.provider === "cursor");
  expect(cursor).toMatchObject({ status: "ok", remainingCents: 1200, plan: "Pro" });
});

test("OpenAI-compatible custom hosts do not pretend to have remaining credits", async () => {
  const report = await collectProviderUsage({
    env: { OPENAI_API_KEY: "sk-test", OPENAI_BASE_URL: "http://127.0.0.1:11434/v1" },
    now: 5,
    http: async () => {
      throw new Error("network should not run");
    },
  });
  const openai = report.meters.find((meter) => meter.provider === "openai");
  expect(openai).toMatchObject({
    status: "ok",
    display: "This OpenAI-compatible endpoint does not report remaining usage.",
  });
});
