import { expect, test } from "bun:test";
import {
  collectProviderUsage,
  locateCodexAuth,
  parseCodexAuth,
  parseCodexUsage,
  parseCursorPeriod,
  parseGrokAuth,
  parseGrokBilling,
  parseOpenAICosts,
  parseOpenAICredits,
  parseXaiPrepaid,
  parseXaiTeamId,
  percentUsed,
  type HttpFetch,
  type LocalAuth,
} from "./providerUsage";

const noLocal: LocalAuth = {
  home: "/no-home",
  readFile: async () => {
    throw Object.assign(new Error("missing"), { code: "ENOENT" });
  },
  keychain: async () => null,
};

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

test("parseCodexAuth reads tokens from auth.json without other fields", () => {
  expect(
    parseCodexAuth(JSON.stringify({ tokens: { access_token: "tok", account_id: "user-1" }, last_refresh: "2026-05-07T00:00:00.000Z" })),
  ).toEqual({ accessToken: "tok", accountId: "user-1" });
  expect(parseCodexAuth(JSON.stringify({ OPENAI_API_KEY: "sk-test" }))).toBeNull();
});

test("parseCodexUsage maps session and weekly windows from ChatGPT usage", () => {
  const meter = parseCodexUsage(
    {
      plan_type: "plus",
      rate_limit: {
        primary_window: {
          used_percent: 30,
          limit_window_seconds: 18_000,
          reset_after_seconds: 2_473,
          reset_at: 1_778_114_717,
        },
        secondary_window: {
          used_percent: 39,
          limit_window_seconds: 604_800,
          reset_after_seconds: 1_690,
          reset_at: 1_778_113_934,
        },
      },
      credits: { has_credits: false, balance: "0" },
    },
    1,
  );
  expect(meter).toMatchObject({
    provider: "codex",
    status: "ok",
    plan: "Plus",
    percentUsed: 30,
    windows: [
      { name: "Session (5h)", percentUsed: 30, windowSeconds: 18_000, resetsAt: 1_778_114_717_000 },
      { name: "Weekly (7d)", percentUsed: 39, windowSeconds: 604_800, resetsAt: 1_778_113_934_000 },
    ],
  });
});

test("parseCodexUsage omits reset on an untouched window", () => {
  const meter = parseCodexUsage(
    {
      rate_limit: {
        primary_window: {
          used_percent: 0,
          limit_window_seconds: 18_000,
          reset_after_seconds: 18_000,
          reset_at: 1_700_000_000,
        },
      },
    },
    1,
  );
  expect(meter?.windows).toEqual([{ name: "Session (5h)", percentUsed: 0, windowSeconds: 18_000 }]);
});

test("locateCodexAuth prefers CODEX_HOME then ~/.codex", async () => {
  const reads: string[] = [];
  const auth = await locateCodexAuth({
    env: { CODEX_HOME: "/tmp/codex-home" },
    local: {
      home: "/Users/test",
      readFile: async (file) => {
        reads.push(file);
        if (file === "/Users/test/.codex/auth.json") {
          return JSON.stringify({ tokens: { access_token: "tok", account_id: "user-1" } });
        }
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
      keychain: async () => null,
    },
  });
  expect(reads[0]).toBe("/tmp/codex-home/auth.json");
  expect(auth).toEqual({ accessToken: "tok", accountId: "user-1" });
});

test("collectProviderUsage reports nothing without calling the network when nothing is signed in", async () => {
  const report = await collectProviderUsage({
    env: {},
    now: 10,
    grokCatalog: { checkedAt: 10, installed: false, models: [] },
    local: noLocal,
    http: async () => {
      throw new Error("network should not run");
    },
  });
  expect(report.meters).toEqual([]);
});

test("collectProviderUsage reads Codex remaining from the local ChatGPT login", async () => {
  const http: HttpFetch = async (url, init) => {
    if (url.includes("/wham/usage")) {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer tok",
        "ChatGPT-Account-Id": "user-1",
        "User-Agent": "OpenUsage",
      });
      return new Response(
        JSON.stringify({
          plan_type: "plus",
          rate_limit: { primary_window: { used_percent: 12, limit_window_seconds: 18_000, reset_at: 2_000 } },
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected ${url}`);
  };
  const report = await collectProviderUsage({
    env: {},
    now: 5,
    http,
    local: {
      home: "/Users/test",
      readFile: async (file) => {
        if (file.endsWith("auth.json")) return JSON.stringify({ tokens: { access_token: "tok", account_id: "user-1" } });
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
      keychain: async () => null,
    },
  });
  const codex = report.meters.find((meter) => meter.provider === "codex");
  expect(codex).toMatchObject({ status: "ok", plan: "Plus", percentUsed: 12 });
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
  const report = await collectProviderUsage({ env: { CURSOR_API_KEY: "crsr_test" }, now: 5, http, local: noLocal });
  const cursor = report.meters.find((meter) => meter.provider === "cursor");
  expect(cursor).toMatchObject({ status: "ok", remainingCents: 1200, plan: "Pro" });
});

test("OpenAI-compatible custom hosts stay hidden when they cannot report remaining credits", async () => {
  const report = await collectProviderUsage({
    env: { OPENAI_API_KEY: "sk-test", OPENAI_BASE_URL: "http://127.0.0.1:11434/v1" },
    now: 5,
    local: noLocal,
    http: async () => {
      throw new Error("network should not run");
    },
  });
  expect(report.meters.find((meter) => meter.provider === "openai")).toBeUndefined();
});

test("parseGrokAuth reads the login key from the issuer-scoped Grok record", () => {
  expect(
    parseGrokAuth(JSON.stringify({ "https://auth.x.ai::client-a": { auth_mode: "oidc", key: " secret-key ", user_id: "person@example.test" } })),
  ).toBe("secret-key");
  expect(parseGrokAuth(JSON.stringify({ "issuer::client": { refresh_token: "x" } }))).toBeNull();
});

test("parseGrokBilling maps weekly included usage and product slices", () => {
  const meter = parseGrokBilling(
    {
      subscription_tier: "SuperGrok Heavy",
      config: {
        creditUsagePercent: 42.5,
        currentPeriod: { type: "USAGE_PERIOD_TYPE_WEEKLY", end: "2026-08-10T00:00:00Z" },
        productUsage: [
          { product: "GrokBuild", usagePercent: 87.4 },
          { product: "GrokChat", usagePercent: 2.6 },
          { product: "Api", usagePercent: 0 },
        ],
        prepaidBalance: { val: 1250 },
      },
    },
    1,
  );
  expect(meter).toMatchObject({
    provider: "grok",
    status: "ok",
    plan: "SuperGrok Heavy",
    percentUsed: 43,
    remainingCents: 1250,
    resetsAt: Date.parse("2026-08-10T00:00:00Z"),
    windows: [
      { name: "Weekly (7d)", percentUsed: 43, windowSeconds: 604_800 },
      { name: "Grok Build", percentUsed: 87 },
      { name: "Grok Chat", percentUsed: 3 },
      { name: "xAI API", percentUsed: 0 },
    ],
  });
});

test("collectProviderUsage reads Grok remaining from the local grok login", async () => {
  const http: HttpFetch = async (url, init) => {
    if (url.includes("cli-chat-proxy.grok.com/v1/billing")) {
      expect(init?.headers).toMatchObject({
        Authorization: "Bearer secret-key",
        "X-XAI-Token-Auth": "xai-grok-cli",
      });
      return new Response(
        JSON.stringify({
          subscription_tier: "SuperGrok",
          config: {
            creditUsagePercent: 12,
            currentPeriod: { type: "USAGE_PERIOD_TYPE_WEEKLY", end: "2026-09-20T00:00:00Z" },
            productUsage: [{ product: "GrokBuild", usagePercent: 10 }],
          },
        }),
        { status: 200 },
      );
    }
    throw new Error(`unexpected ${url}`);
  };
  const report = await collectProviderUsage({
    env: {},
    now: 5,
    http,
    local: {
      home: "/Users/test",
      readFile: async (file) => {
        if (file === "/Users/test/.grok/auth.json") {
          return JSON.stringify({ "https://auth.x.ai::client-a": { key: "secret-key" } });
        }
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
      keychain: async () => null,
    },
  });
  const grok = report.meters.find((meter) => meter.provider === "grok");
  expect(grok).toMatchObject({ status: "ok", plan: "SuperGrok", percentUsed: 12 });
  expect(grok?.status === "ok" ? grok.windows?.map((window) => window.name) : []).toEqual(["Weekly (7d)", "Grok Build"]);
});
