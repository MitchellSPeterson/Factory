import { Cursor } from "@cursor/sdk";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AGENT_PROVIDERS, type AgentProvider } from "../shared/agentModel";
import type { ProviderModels } from "../shared/dataModel";
import { collectCommand, probeGrokCatalog } from "./grokAcp";
import { locateClaudeAuth, locateCodexAuth } from "./providerUsage";

type Env = Record<string, string | undefined>;
type Model = ProviderModels["models"][number];
type Probe = { authenticated: boolean; models: Model[]; message?: string };

const fail = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200);

function processEnv(env: Env) {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined));
}

export function claudeBin(env: Env = process.env) {
  const local = path.join(os.homedir(), ".local/bin/claude");
  return env.CLAUDE_PATH?.trim() || (existsSync(local) ? local : "claude");
}

async function claudeToken(env: Env): Promise<string | undefined> {
  return env.ANTHROPIC_API_KEY?.trim() || (await locateClaudeAuth({ env }))?.accessToken;
}

async function claudeModels(env: Env): Promise<Probe> {
  const status = await collectCommand(claudeBin(env), ["auth", "status"], processEnv(env), 8000);
  if (!status) return { authenticated: false, models: [], message: "Claude Code CLI is not installed." };
  if (!/"loggedIn":\s*true/.test(status.text)) return { authenticated: false, models: [], message: "Run `claude auth login` on this Mac." };
  const token = await claudeToken(env);
  if (token) {
    const oauth = !token.startsWith("sk-ant-api");
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: {
        "anthropic-version": "2023-06-01",
        ...(oauth ? { authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" } : { "x-api-key": token }),
      },
    }).catch(() => null);
    if (res?.ok) {
      const body = (await res.json()) as { data?: Array<{ id: string; display_name?: string }> };
      return { authenticated: true, models: (body.data ?? []).map((m) => ({ id: m.id, name: m.display_name ?? m.id })) };
    }
  }
  // ponytail: stored OAuth token expired or unreadable; the CLI still resolves its own aliases.
  return {
    authenticated: true,
    models: [
      { id: "opus", name: "Claude Opus" },
      { id: "sonnet", name: "Claude Sonnet" },
      { id: "haiku", name: "Claude Haiku" },
    ],
    message: "Showing Claude Code aliases; the model list could not be fetched.",
  };
}

async function codexModels(env: Env): Promise<Probe> {
  const signedIn = (await locateCodexAuth({ env })) !== null || !!(env.CODEX_API_KEY?.trim() || env.OPENAI_API_KEY?.trim());
  if (!signedIn) return { authenticated: false, models: [], message: "Run `codex login` on this Mac." };
  const home = env.CODEX_HOME?.trim() || path.join(os.homedir(), ".codex");
  try {
    const cache = JSON.parse(await readFile(path.join(home, "models_cache.json"), "utf8")) as {
      models?: Array<{ slug: string; display_name?: string; visibility?: string }>;
    };
    const models = (cache.models ?? []).filter((m) => m.visibility !== "hide").map((m) => ({ id: m.slug, name: m.display_name ?? m.slug }));
    return { authenticated: true, models };
  } catch {
    return { authenticated: true, models: [], message: "Open Codex once so it downloads the model list." };
  }
}

async function cursorModels(env: Env): Promise<Probe> {
  const apiKey = env.CURSOR_API_KEY?.trim();
  if (!apiKey) return { authenticated: false, models: [], message: "Set CURSOR_API_KEY in Worker environment." };
  const models = await Cursor.models.list({ apiKey });
  return { authenticated: true, models: models.map((m) => ({ id: m.id, name: m.displayName ?? m.id })) };
}

async function grokModels(env: Env): Promise<Probe> {
  const catalog = await probeGrokCatalog(env);
  return {
    authenticated: catalog.installed && catalog.authenticated !== false && catalog.models.length > 0,
    models: catalog.models.map((m) => ({ id: m.slug, name: m.name })),
    message: catalog.message,
  };
}

async function openaiModels(env: Env): Promise<Probe> {
  const base = env.OPENAI_BASE_URL?.trim();
  if (!base) return { authenticated: false, models: [], message: "Set OPENAI_BASE_URL in Worker environment." };
  const key = env.OPENAI_API_KEY?.trim();
  const res = await fetch(`${base.replace(/\/+$/, "")}/models`, { headers: key ? { authorization: `Bearer ${key}` } : {} });
  if (res.status === 401 || res.status === 403) return { authenticated: false, models: [], message: "OPENAI_API_KEY was rejected." };
  if (!res.ok) throw new Error(`Model list failed (${res.status}).`);
  const body = (await res.json()) as { data?: Array<{ id: string }> };
  return { authenticated: true, models: (body.data ?? []).map((m) => ({ id: m.id, name: m.id })) };
}

const PROBES: Record<AgentProvider, (env: Env) => Promise<Probe>> = {
  claude: claudeModels,
  codex: codexModels,
  cursor: cursorModels,
  grok: grokModels,
  openai: openaiModels,
};

export async function collectProviderModels(env: Env, disabled: readonly string[] = []): Promise<ProviderModels[]> {
  return Promise.all(
    AGENT_PROVIDERS.map(async (provider): Promise<ProviderModels> => {
      if (disabled.includes(provider)) return { provider, enabled: false, authenticated: false, models: [] };
      try {
        return { provider, enabled: true, ...(await PROBES[provider](env)) };
      } catch (error) {
        return { provider, enabled: true, authenticated: false, models: [], message: fail(error) };
      }
    }),
  );
}
