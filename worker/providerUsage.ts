import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { AgentProvider } from "../shared/agentModel";
import { providerLabel } from "../shared/agentModel";
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
      windows?: UsageWindow[];
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

export type UsageWindow = {
  name: string;
  percentUsed: number;
  resetsAt?: number;
  windowSeconds?: number;
};

export type CodexAuth = { accessToken: string; accountId: string };

export type ProviderUsageReport = { checkedAt: number; meters: ProviderMeter[] };

export type HttpFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type LocalAuth = {
  home?: string;
  readFile?: (file: string) => Promise<string>;
  keychain?: () => Promise<string | null>;
};

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

export function epochMs(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value;
}

function compactDuration(seconds: number): string {
  if (seconds % 86_400 === 0) return `${seconds / 86_400}d`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function parseCodexAuth(raw: string): CodexAuth | null {
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(body) || !isRecord(body.tokens)) return null;
  const accessToken = stringField(body.tokens.access_token);
  const accountId = stringField(body.tokens.account_id);
  if (!accessToken || !accountId) return null;
  return { accessToken, accountId };
}

function decodeHexUtf8(hex: string): string | null {
  const body = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (body.length % 2 !== 0) return null;
  const bytes = new Uint8Array(body.length / 2);
  for (let i = 0; i < body.length; i += 2) {
    const byte = Number.parseInt(body.slice(i, i + 2), 16);
    if (!Number.isFinite(byte)) return null;
    bytes[i / 2] = byte;
  }
  return new TextDecoder().decode(bytes);
}

export async function readCodexKeychain(run?: () => Promise<{ code: number; stdout: string }>): Promise<string | null> {
  const exec =
    run ??
    (async () => {
      if (process.platform !== "darwin") return { code: 1, stdout: "" };
      const proc = Bun.spawn(["/usr/bin/security", "find-generic-password", "-s", "Codex Auth", "-w"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const timer = setTimeout(() => proc.kill(), 3_000);
      try {
        const [code, stdout] = await Promise.all([proc.exited, new Response(proc.stdout).text()]);
        return { code, stdout };
      } finally {
        clearTimeout(timer);
      }
    });
  const result = await exec();
  if (result.code !== 0) return null;
  let raw = result.stdout.trim();
  if (raw.startsWith("0x")) raw = decodeHexUtf8(raw) ?? raw;
  return raw || null;
}

export async function locateCodexAuth(opts: { env?: Env; local?: LocalAuth } = {}): Promise<CodexAuth | null> {
  const home = opts.local?.home ?? os.homedir();
  const read = opts.local?.readFile ?? ((file: string) => readFile(file, "utf8"));
  const candidates: string[] = [];
  const codexHome = opts.env?.CODEX_HOME?.trim();
  if (codexHome) candidates.push(path.join(codexHome, "auth.json"));
  candidates.push(path.join(home, ".config", "codex", "auth.json"));
  candidates.push(path.join(home, ".codex", "auth.json"));
  for (const file of candidates) {
    try {
      const parsed = parseCodexAuth(await read(file));
      if (parsed) return parsed;
    } catch {
      // missing or unreadable; try the next cascade entry
    }
  }
  try {
    const raw = opts.local?.keychain ? await opts.local.keychain() : await readCodexKeychain();
    return raw ? parseCodexAuth(raw) : null;
  } catch {
    return null;
  }
}

export function parseGrokAuth(raw: string): string | null {
  let body: unknown;
  try {
    body = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(body)) return null;
  for (const entry of Object.values(body)) {
    if (!isRecord(entry)) continue;
    const key = stringField(entry.key)?.trim();
    if (key) return key;
  }
  return null;
}

export async function locateGrokAuth(opts: { env?: Env; local?: LocalAuth } = {}): Promise<string | null> {
  const home = opts.local?.home ?? os.homedir();
  const read = opts.local?.readFile ?? ((file: string) => readFile(file, "utf8"));
  const candidates: string[] = [];
  const grokHome = opts.env?.GROK_HOME?.trim();
  if (grokHome) candidates.push(path.join(grokHome, "auth.json"));
  candidates.push(path.join(home, ".grok", "auth.json"));
  for (const file of candidates) {
    try {
      const key = parseGrokAuth(await read(file));
      if (key) return key;
    } catch {
      // missing or unreadable; try the next cascade entry
    }
  }
  return null;
}

function pickField(record: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    if (record[name] !== undefined) return record[name];
  }
  return undefined;
}

function rfc3339Ms(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function grokProductLabel(raw: string): string {
  if (raw === "GrokBuild") return "Grok Build";
  if (raw === "GrokChat") return "Grok Chat";
  if (raw === "GrokImagine") return "Grok Imagine";
  if (raw === "GrokTasks") return "Grok Tasks";
  if (raw === "Api") return "xAI API";
  if (raw.startsWith("Grok") && raw.length > 4) {
    const rest = raw.slice(4).replaceAll(/([A-Z])/g, " $1").trim();
    return rest ? `Grok ${rest}` : "Grok";
  }
  return raw;
}

function grokPercent(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value < 0 || value > 100.5) return undefined;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function parseGrokBilling(body: unknown, now: number): ProviderMeter | null {
  if (!isRecord(body) || !isRecord(body.config)) return null;
  const config = body.config;
  const period = isRecord(pickField(config, "currentPeriod", "current_period"))
    ? (pickField(config, "currentPeriod", "current_period") as Record<string, unknown>)
    : undefined;
  const periodType = stringField(period?.type) ?? stringField(period?.period_type) ?? "";
  const weekly = periodType.endsWith("WEEKLY");
  const monthly = periodType.endsWith("MONTHLY");
  const windowSeconds = weekly ? 604_800 : monthly ? 30 * 86_400 : undefined;
  const windowName = weekly ? "Weekly (7d)" : monthly ? "Monthly" : "Included";
  const resetsAt = rfc3339Ms(
    stringField(period?.end) ?? stringField(pickField(config, "billingPeriodEnd", "billing_period_end")),
  );
  let overall = grokPercent(numberField(pickField(config, "creditUsagePercent", "credit_usage_percent")));
  if (overall === undefined && period) overall = 0;
  const windows: UsageWindow[] = [];
  if (overall !== undefined) {
    windows.push({ name: windowName, percentUsed: overall, resetsAt, windowSeconds });
  }
  const products = pickField(config, "productUsage", "product_usage");
  if (Array.isArray(products)) {
    for (const item of products.slice(0, 6)) {
      if (!isRecord(item)) continue;
      const label = stringField(pickField(item, "product"));
      if (!label) continue;
      const percent = grokPercent(numberField(pickField(item, "usagePercent", "usage_percent"))) ?? 0;
      windows.push({ name: grokProductLabel(label), percentUsed: percent, resetsAt, windowSeconds });
    }
  }
  const prepaid = isRecord(pickField(config, "prepaidBalance", "prepaid_balance"))
    ? numberField((pickField(config, "prepaidBalance", "prepaid_balance") as Record<string, unknown>).val)
    : undefined;
  const plan = stringField(pickField(body, "subscription_tier", "subscriptionTier")) ?? "SuperGrok";
  if (windows.length === 0 && prepaid === undefined) return null;
  return {
    provider: "grok",
    status: "ok",
    checkedAt: now,
    plan,
    percentUsed: windows[0]?.percentUsed,
    resetsAt,
    remainingCents: prepaid,
    windows: windows.slice(0, 8),
  };
}

async function fetchGrokLocal(key: string, now: number, http: HttpFetch): Promise<ProviderMeter> {
  const response = await http("https://cli-chat-proxy.grok.com/v1/billing?format=credits", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "X-XAI-Token-Auth": "xai-grok-cli",
    },
  });
  const body = await readJson(response);
  if (response.status === 401) {
    return { provider: "grok", status: "error", checkedAt: now, message: "Grok login expired. Run `grok login` on this machine." };
  }
  const meter = parseGrokBilling(body, now);
  if (!response.ok || !meter) {
    return { provider: "grok", status: "error", checkedAt: now, message: "Grok Build did not return current usage." };
  }
  return meter;
}

function extractCodexWindow(
  window: unknown,
  fallbackName: string,
  fallbackSeconds: number,
): UsageWindow | null {
  if (!isRecord(window)) return null;
  const used = percentUsed(undefined, undefined, numberField(window.used_percent));
  if (used === undefined) return null;
  const limitSeconds = numberField(window.limit_window_seconds);
  const resetAfter = numberField(window.reset_after_seconds);
  const windowSeconds = limitSeconds && limitSeconds > 0 ? limitSeconds : fallbackSeconds;
  const fresh = limitSeconds !== undefined && resetAfter !== undefined && resetAfter >= limitSeconds;
  const resetEpoch = numberField(window.reset_at);
  const name = `${fallbackName} (${compactDuration(windowSeconds)})`;
  return {
    name,
    percentUsed: used,
    windowSeconds,
    resetsAt: fresh || resetEpoch === undefined ? undefined : epochMs(resetEpoch),
  };
}

export function parseCodexUsage(body: unknown, now: number): ProviderMeter | null {
  if (!isRecord(body)) return null;
  const windows: UsageWindow[] = [];
  const rateLimit = isRecord(body.rate_limit) ? body.rate_limit : undefined;
  const primary = extractCodexWindow(rateLimit?.primary_window, "Session", 18_000);
  const weekly = extractCodexWindow(rateLimit?.secondary_window, "Weekly", 604_800);
  if (primary) windows.push(primary);
  if (weekly) windows.push(weekly);
  const review = extractCodexWindow(
    isRecord(body.code_review_rate_limit) ? body.code_review_rate_limit.primary_window : undefined,
    "Code review",
    604_800,
  );
  if (review) windows.push(review);
  const extra = Array.isArray(body.additional_rate_limits) ? body.additional_rate_limits : [];
  for (const entry of extra) {
    if (!isRecord(entry)) continue;
    const label = stringField(entry.limit_name) ?? "Model";
    const nested = isRecord(entry.rate_limit) ? entry.rate_limit : undefined;
    const extraPrimary = extractCodexWindow(nested?.primary_window, label, 18_000);
    const extraWeekly = extractCodexWindow(nested?.secondary_window, `${label} weekly`, 604_800);
    if (extraPrimary) windows.push(extraPrimary);
    if (extraWeekly) windows.push(extraWeekly);
  }
  const credits = isRecord(body.credits) ? body.credits : undefined;
  const hasCredits = credits?.has_credits === true;
  const balance = hasCredits ? numberField(credits.balance) : undefined;
  const plan = stringField(body.plan_type);
  if (windows.length === 0 && balance === undefined) return null;
  return {
    provider: "codex",
    status: "ok",
    checkedAt: now,
    plan: plan ? titleCase(plan) : undefined,
    percentUsed: windows[0]?.percentUsed,
    resetsAt: windows[0]?.resetsAt,
    windows: windows.slice(0, 8),
    display: balance !== undefined ? `${balance} credits remaining.` : undefined,
  };
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
      const ms = epochMs(expires);
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
  if (!opts.managementKey || !teamId) {
    return { provider: opts.provider, status: "unconfigured", checkedAt: opts.now, message: "xAI prepaid balance is unavailable." };
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

async function fetchCodexLocal(auth: CodexAuth, now: number, http: HttpFetch): Promise<ProviderMeter> {
  const response = await http("https://chatgpt.com/backend-api/wham/usage", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      "ChatGPT-Account-Id": auth.accountId,
      "User-Agent": "OpenUsage",
    },
  });
  const body = await readJson(response);
  if (response.status === 401) {
    return { provider: "codex", status: "error", checkedAt: now, message: "Codex login expired. Run `codex login` on this machine." };
  }
  const meter = parseCodexUsage(body, now);
  if (!response.ok || !meter) {
    return { provider: "codex", status: "error", checkedAt: now, message: "Codex did not return current usage." };
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
      return { provider: "openai", status: "unconfigured", checkedAt: now, message: "This OpenAI-compatible endpoint does not report remaining usage." };
    }
    return await fetchOpenAIFamily({ provider: "openai", apiKey: key, now, http });
  } catch (error) {
    return { provider: "openai", status: "error", checkedAt: now, message: error instanceof Error ? error.message : "OpenAI usage check failed." };
  }
}

async function codexMeter(env: Env, now: number, http: HttpFetch, local?: LocalAuth): Promise<ProviderMeter> {
  const auth = await locateCodexAuth({ env, local });
  if (auth) {
    try {
      return await fetchCodexLocal(auth, now, http);
    } catch (error) {
      return { provider: "codex", status: "error", checkedAt: now, message: error instanceof Error ? error.message : "Codex usage check failed." };
    }
  }
  const key = env.CODEX_API_KEY?.trim() || env.OPENAI_API_KEY?.trim();
  const base = env.CODEX_BASE_URL?.trim();
  if (!key) {
    return { provider: "codex", status: "unconfigured", checkedAt: now, message: "Sign in with Codex on this machine." };
  }
  if (base && !isOpenAIHost(base)) {
    return { provider: "codex", status: "unconfigured", checkedAt: now, message: "This Codex endpoint does not report remaining usage." };
  }
  try {
    return await fetchOpenAIFamily({ provider: "codex", apiKey: key, now, http });
  } catch (error) {
    return { provider: "codex", status: "error", checkedAt: now, message: error instanceof Error ? error.message : "Codex usage check failed." };
  }
}

async function grokMeter(env: Env, now: number, http: HttpFetch, local?: LocalAuth): Promise<ProviderMeter> {
  const loginKey = await locateGrokAuth({ env, local });
  if (loginKey) {
    try {
      return await fetchGrokLocal(loginKey, now, http);
    } catch (error) {
      return { provider: "grok", status: "error", checkedAt: now, message: error instanceof Error ? error.message : "Grok usage check failed." };
    }
  }
  const key = env.XAI_API_KEY?.trim();
  if (!key) {
    return { provider: "grok", status: "unconfigured", checkedAt: now, message: "Sign in with Grok on this machine." };
  }
  try {
    return await fetchXai({ provider: "grok", apiKey: key, managementKey: env.XAI_MANAGEMENT_KEY?.trim(), now, http });
  } catch (error) {
    return { provider: "grok", status: "error", checkedAt: now, message: error instanceof Error ? error.message : "Grok usage check failed." };
  }
}

function hasUsage(meter: ProviderMeter): boolean {
  if (meter.status === "error") return true;
  if (meter.status !== "ok") return false;
  return (
    meter.windows !== undefined && meter.windows.length > 0 ||
    meter.remainingCents !== undefined ||
    meter.usedCents !== undefined ||
    meter.percentUsed !== undefined
  );
}

export async function collectProviderUsage(opts: {
  env: Env;
  now?: number;
  http?: HttpFetch;
  grokCatalog?: GrokCatalog;
  local?: LocalAuth;
}): Promise<ProviderUsageReport> {
  const now = opts.now ?? Date.now();
  const http = opts.http ?? fetch;
  const meters = (
    await Promise.all([
      cursorMeter(opts.env, now, http),
      codexMeter(opts.env, now, http, opts.local),
      grokMeter(opts.env, now, http, opts.local),
      openaiMeter(opts.env, now, http),
    ])
  ).filter(hasUsage);
  return { checkedAt: now, meters };
}
