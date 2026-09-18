import type { AgentProvider } from "../convex/lib/agentModel";
import { providerLabel } from "../convex/lib/agentModel";
import type { GrokCatalog } from "./grokAcp";

export type ProviderMeter =
  | {
      provider: AgentProvider;
      status: "ok";
      checkedAt: number;
      plan?: string;
      usedCents?: number;
      remainingCents?: number;
      limitCents?: number;
      percentUsed?: number;
      resetsAt?: number;
      display?: string;
    }
  | {
      provider: AgentProvider;
      status: "unconfigured";
      checkedAt: number;
      message: string;
    }
  | {
      provider: AgentProvider;
      status: "error";
      checkedAt: number;
      message: string;
    };

export type ProviderUsageReport = { checkedAt: number; meters: ProviderMeter[] };

export type HttpFetch = (input: string, init?: RequestInit) => Promise<Response>;

type Env = Record<string, string | undefined>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function numberField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function hostOf(url: string | undefined): string | undefined {
  if (!url?.trim()) return undefined;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return undefined;
  }
}

function isOpenAIHost(baseUrl?: string): boolean {
  const host = hostOf(baseUrl);
  return host === undefined || host === "api.openai.com" || host.endsWith(".openai.com");
}

function isXaiHost(baseUrl?: string): boolean {
  const host = hostOf(baseUrl);
  return host === "api.x.ai" || host === "api.x.ai:443";
}

export function percentUsed(used?: number, limit?: number, reported?: number): number | undefined {
  if (reported !== undefined && Number.isFinite(reported)) {
    if (reported >= 0 && reported <= 1) return reported * 100;
    if (reported >= 0 && reported <= 100) return reported;
  }
  if (used === undefined || limit === undefined || limit <= 0) return undefined;
  return Math.max(0, Math.min(100, (used / limit) * 100));
}

export function dollarsToCents(value: number): number {
  return Math.round(value * 100);
}

export function parseCursorPeriod(body: unknown, now: number, plan?: string): ProviderMeter | null {
  if (!isRecord(body)) return null;
  const usage = isRecord(body.planUsage) ? body.planUsage : body;
  const remainingCents = numberField(usage.remaining);
  const limitCents = numberField(usage.limit) ?? numberField(usage.includedSpend);
  const usedCents = numberField(usage.totalSpend) ?? numberField(usage.includedSpend);
  const resetsAt = numberField(body.billingCycleEnd);
  const display = stringField(body.displayMessage);
  if (remainingCents === undefined && limitCents === undefined && usedCents === undefined && !display) return null;
  return {
    provider: "cursor",
    status: "ok",
    checkedAt: now,
    plan,
    usedCents,
    remainingCents,
    limitCents,
    percentUsed: percentUsed(usedCents, limitCents, numberField(usage.totalPercentUsed)),
    resetsAt,
    display,
  };
}

export function parseOpenAICredits(body: unknown, now: number, provider: AgentProvider): ProviderMeter | null {
  if (!isRecord(body)) return null;
  const granted = numberField(body.total_granted) ?? numberField(body.totalGranted);
  const used = numberField(body.total_used) ?? numberField(body.totalUsed);
  const available = numberField(body.total_available) ?? numberField(body.totalAvailable);
  if (granted === undefined && used === undefined && available === undefined) return null;
  let resetsAt: number | undefined;
  const grants = isRecord(body.grants) ? body.grants.data : body.grants;
  if (Array.isArray(grants)) {
    for (const grant of grants) {
      if (!isRecord(grant)) continue;
      const expires = numberField(grant.expires_at) ?? numberField(grant.expiresAt);
      if (expires === undefined) continue;
      const ms = expires < 10_000_000_000 ? expires * 1000 : expires;
      if (ms > now && (resetsAt === undefined || ms < resetsAt)) resetsAt = ms;
    }
  }
  const limitCents = granted === undefined ? undefined : dollarsToCents(granted);
  const usedCents = used === undefined ? undefined : dollarsToCents(used);
  const remainingCents = available === undefined ? undefined : dollarsToCents(available);
  return {
    provider,
    status: "ok",
    checkedAt: now,
    usedCents,
    remainingCents,
    limitCents,
    percentUsed: percentUsed(usedCents, limitCents),
    resetsAt,
  };
}

export function parseOpenAICosts(body: unknown, now: number, provider: AgentProvider): ProviderMeter | null {
  if (!isRecord(body) || !Array.isArray(body.data)) return null;
  let dollars = 0;
  let found = false;
  for (const bucket of body.data) {
    if (!isRecord(bucket) || !Array.isArray(bucket.results)) continue;
    for (const result of bucket.results) {
      if (!isRecord(result) || !isRecord(result.amount)) continue;
      const value = numberField(result.amount.value);
      if (value === undefined) continue;
      dollars += value;
      found = true;
    }
  }
  if (!found) return null;
  const usedCents = dollarsToCents(dollars);
  return {
    provider,
    status: "ok",
    checkedAt: now,
    usedCents,
    display: "Used this month. Remaining credits need a billing-capable API key.",
  };
}

export function parseXaiPrepaid(body: unknown, now: number, provider: AgentProvider): ProviderMeter | null {
  if (!isRecord(body)) return null;
  const total = isRecord(body.total) ? numberField(body.total.val) ?? numberField(body.total.value) : numberField(body.total);
  if (total === undefined) return null;
  return {
    provider,
    status: "ok",
    checkedAt: now,
    remainingCents: total,
    display: "Prepaid xAI credits remaining.",
  };
}

export function parseXaiTeamId(body: unknown): string | undefined {
  if (!isRecord(body)) return undefined;
  return stringField(body.team_id) ?? stringField(body.teamId) ?? (isRecord(body.team) ? stringField(body.team.id) : undefined);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function getJson(http: HttpFetch, url: string, headers: Record<string, string>): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await http(url, { method: "GET", headers });
  return { ok: response.ok, status: response.status, body: await readJson(response) };
}

async function postJson(http: HttpFetch, url: string, headers: Record<string, string>, body: unknown): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await http(url, { method: "POST", headers, body: JSON.stringify(body) });
  return { ok: response.ok, status: response.status, body: await readJson(response) };
}

async function fetchCursor(apiKey: string, now: number, http: HttpFetch): Promise<ProviderMeter> {
  const exchange = await postJson(
    http,
    "https://api2.cursor.sh/auth/exchange_user_api_key",
    { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    {},
  );
  const token = isRecord(exchange.body) ? stringField(exchange.body.accessToken) ?? stringField(exchange.body.access_token) : undefined;
  if (!exchange.ok || !token) {
    return { provider: "cursor", status: "error", checkedAt: now, message: "CURSOR_API_KEY was rejected by Cursor." };
  }
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Connect-Protocol-Version": "1",
  };
  const [period, plan] = await Promise.all([
    postJson(http, "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage", headers, {}),
    postJson(http, "https://api2.cursor.sh/aiserver.v1.DashboardService/GetPlanInfo", headers, {}),
  ]);
  const planName = isRecord(plan.body) && isRecord(plan.body.planInfo) ? stringField(plan.body.planInfo.planName) : undefined;
  const meter = parseCursorPeriod(period.body, now, planName);
  if (!period.ok || !meter) {
    return { provider: "cursor", status: "error", checkedAt: now, message: "Cursor did not return current-period usage." };
  }
  return meter;
}

async function fetchOpenAIFamily(opts: {
  provider: AgentProvider;
  apiKey: string;
  now: number;
  http: HttpFetch;
}): Promise<ProviderMeter> {
  const auth = { Authorization: `Bearer ${opts.apiKey}` };
  const grants = await getJson(opts.http, "https://api.openai.com/v1/dashboard/billing/credit_grants", auth);
  const fromGrants = parseOpenAICredits(grants.body, opts.now, opts.provider);
  if (grants.ok && fromGrants) return fromGrants;
  const start = Math.floor(new Date(Date.UTC(new Date(opts.now).getUTCFullYear(), new Date(opts.now).getUTCMonth(), 1)).getTime() / 1000);
  const costs = await getJson(opts.http, `https://api.openai.com/v1/organization/costs?start_time=${start}&limit=31`, auth);
  const fromCosts = parseOpenAICosts(costs.body, opts.now, opts.provider);
  if (costs.ok && fromCosts) return fromCosts;
  if (grants.status === 401 || costs.status === 401) {
    return { provider: opts.provider, status: "error", checkedAt: opts.now, message: `${opts.provider === "codex" ? "CODEX_API_KEY" : "OPENAI_API_KEY"} was rejected.` };
  }
  return {
    provider: opts.provider,
    status: "error",
    checkedAt: opts.now,
    message: `${providerLabel(opts.provider)} did not return remaining credits for this key.`,
  };
}

async function fetchXai(opts: {
  provider: AgentProvider;
  apiKey: string;
  managementKey?: string;
  now: number;
  http: HttpFetch;
}): Promise<ProviderMeter> {
  const info = await getJson(opts.http, "https://api.x.ai/v1/api-key", { Authorization: `Bearer ${opts.apiKey}` });
  if (!info.ok) {
    return { provider: opts.provider, status: "error", checkedAt: opts.now, message: "XAI_API_KEY was rejected by xAI." };
  }
  const teamId = parseXaiTeamId(info.body);
  if (!opts.managementKey) {
    return {
      provider: opts.provider,
      status: "ok",
      checkedAt: opts.now,
      display: "xAI key is valid. Remaining prepaid credits need XAI_MANAGEMENT_KEY.",
    };
  }
  if (!teamId) {
    return {
      provider: opts.provider,
      status: "ok",
      checkedAt: opts.now,
      display: "xAI key is valid. Remaining credits are in the xAI console.",
    };
  }
  const balance = await getJson(opts.http, `https://management-api.x.ai/v1/billing/teams/${teamId}/prepaid/balance`, {
    Authorization: `Bearer ${opts.managementKey}`,
  });
  const meter = parseXaiPrepaid(balance.body, opts.now, opts.provider);
  if (!balance.ok || !meter) {
    return {
      provider: opts.provider,
      status: "error",
      checkedAt: opts.now,
      message: "xAI Management API did not return prepaid balance.",
    };
  }
  return meter;
}

async function cursorMeter(env: Env, now: number, http: HttpFetch): Promise<ProviderMeter> {
  const key = env.CURSOR_API_KEY?.trim();
  if (!key) {
    return { provider: "cursor", status: "unconfigured", checkedAt: now, message: "Set CURSOR_API_KEY in worker environment." };
  }
  try {
    return await fetchCursor(key, now, http);
  } catch (error) {
    return { provider: "cursor", status: "error", checkedAt: now, message: error instanceof Error ? error.message : "Cursor usage check failed." };
  }
}

async function openaiMeter(env: Env, now: number, http: HttpFetch): Promise<ProviderMeter> {
  const key = env.OPENAI_API_KEY?.trim();
  const base = env.OPENAI_BASE_URL?.trim();
  if (!key) {
    return { provider: "openai", status: "unconfigured", checkedAt: now, message: "Set OPENAI_API_KEY in worker environment." };
  }
  try {
    if (isXaiHost(base)) {
      return await fetchXai({ provider: "openai", apiKey: key, managementKey: env.XAI_MANAGEMENT_KEY?.trim(), now, http });
    }
    if (!isOpenAIHost(base)) {
      return {
        provider: "openai",
        status: "ok",
        checkedAt: now,
        display: "This OpenAI-compatible endpoint does not report remaining usage.",
      };
    }
    return await fetchOpenAIFamily({ provider: "openai", apiKey: key, now, http });
  } catch (error) {
    return { provider: "openai", status: "error", checkedAt: now, message: error instanceof Error ? error.message : "OpenAI usage check failed." };
  }
}

async function codexMeter(env: Env, now: number, http: HttpFetch): Promise<ProviderMeter> {
  const key = env.CODEX_API_KEY?.trim() || env.OPENAI_API_KEY?.trim();
  const base = env.CODEX_BASE_URL?.trim();
  if (!key) {
    return { provider: "codex", status: "unconfigured", checkedAt: now, message: "Set CODEX_API_KEY in worker environment, or sign in with Codex on this machine." };
  }
  if (base && !isOpenAIHost(base)) {
    return {
      provider: "codex",
      status: "ok",
      checkedAt: now,
      display: "This Codex endpoint does not report remaining usage.",
    };
  }
  try {
    return await fetchOpenAIFamily({ provider: "codex", apiKey: key, now, http });
  } catch (error) {
    return { provider: "codex", status: "error", checkedAt: now, message: error instanceof Error ? error.message : "Codex usage check failed." };
  }
}

async function grokMeter(env: Env, now: number, http: HttpFetch, catalog?: GrokCatalog): Promise<ProviderMeter> {
  const key = env.XAI_API_KEY?.trim();
  if (key) {
    try {
      return await fetchXai({ provider: "grok", apiKey: key, managementKey: env.XAI_MANAGEMENT_KEY?.trim(), now, http });
    } catch (error) {
      return { provider: "grok", status: "error", checkedAt: now, message: error instanceof Error ? error.message : "Grok usage check failed." };
    }
  }
  if (catalog?.authenticated === true) {
    return {
      provider: "grok",
      status: "ok",
      checkedAt: now,
      display: "Grok Build is signed in. Remaining credits are in the xAI console, or set XAI_API_KEY and XAI_MANAGEMENT_KEY.",
    };
  }
  return {
    provider: "grok",
    status: "unconfigured",
    checkedAt: now,
    message: catalog?.message ?? "Run `grok login` or set XAI_API_KEY in worker environment.",
  };
}

export async function collectProviderUsage(opts: {
  env: Env;
  now?: number;
  http?: HttpFetch;
  grokCatalog?: GrokCatalog;
}): Promise<ProviderUsageReport> {
  const now = opts.now ?? Date.now();
  const http = opts.http ?? fetch;
  const meters = await Promise.all([
    cursorMeter(opts.env, now, http),
    codexMeter(opts.env, now, http),
    grokMeter(opts.env, now, http, opts.grokCatalog),
    openaiMeter(opts.env, now, http),
  ]);
  return { checkedAt: now, meters };
}
