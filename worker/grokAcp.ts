import { readFileSync } from "node:fs";
import type { AGENT_EFFORTS } from "../shared/agentModel";
import type { PermissionMode } from "../shared/validators";
import { createAcpClient, type AcpProcess } from "./acpClient";
import { grokResumeId } from "./grokAgent";
import type { TokenUsage } from "./usage";

export type GrokCatalogModel = { slug: string; name: string; isDefault?: boolean };
export type GrokCatalog = {
  checkedAt: number;
  installed: boolean;
  authenticated?: boolean;
  version?: string;
  message?: string;
  models: GrokCatalogModel[];
};

export type GrokSessionItem = {
  itemId: string;
  kind: "tool" | "permission" | "reasoning";
  title?: string;
  detail?: string;
  status?: "inProgress" | "completed" | "failed" | "pending" | "resolved" | "denied";
  text?: string;
  requestId?: string;
  options?: Array<{ optionId: string; name: string; kind?: string }>;
};

export type GrokAcpSessionOptions = {
  workingDirectory: string;
  model: string;
  effort: (typeof AGENT_EFFORTS)[number];
  permissionMode: PermissionMode;
  prompt: string;
  imagePaths?: string[];
  resumeSessionId?: string;
  env?: Record<string, string | undefined>;
  onSessionId: (id: string) => Promise<unknown>;
  onText: (text: string) => void;
  onItem: (item: GrokSessionItem) => Promise<unknown>;
  onUsage?: (usage: TokenUsage) => void | Promise<void>;
  waitForPermission: (input: {
    requestId: string;
    itemId: string;
    title: string;
    detail?: string;
    options: Array<{ optionId: string; name: string; kind?: string }>;
  }) => Promise<{ outcome: "selected"; optionId: string } | { outcome: "cancelled" }>;
  getStatus: () => Promise<string | null>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function grokAcpSpawnArgs(permissionMode: PermissionMode): string[] {
  switch (permissionMode) {
    case "supervised":
      return ["--permission-mode", "default", "agent", "stdio"];
    case "auto-accept-edits":
      return ["--permission-mode", "acceptEdits", "agent", "stdio"];
    case "auto":
      return ["--permission-mode", "auto", "agent", "stdio"];
    case "full-access":
      return ["agent", "--always-approve", "stdio"];
  }
}

export function grokEffortToken(effort: (typeof AGENT_EFFORTS)[number]): string {
  return effort === "ultra" ? "max" : effort;
}

export function parseGrokModelsCliOutput(output: string): {
  authenticated: boolean | null;
  models: GrokCatalogModel[];
} {
  const authenticated = /you are logged in/i.test(output)
    ? true
    : /not authenticated|not logged in/i.test(output)
      ? false
      : null;
  const seen = new Set<string>();
  const models: GrokCatalogModel[] = [];
  for (const line of output.split(/\r?\n/)) {
    const bullet = line.match(/^\s*[*-]\s+(\S+)(.*)$/);
    if (!bullet?.[1]) continue;
    const slug = bullet[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    models.push({
      slug,
      name: displayNameFromGrokModelSlug(slug),
      ...(/\((?:default)\)/i.test(bullet[2] ?? "") ? { isDefault: true } : {}),
    });
  }
  return { authenticated, models };
}

export function parseGenericCliVersion(output: string): string | undefined {
  const match = output.match(/\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/);
  return match?.[1];
}

function displayNameFromGrokModelSlug(slug: string): string {
  return slug
    .split(/[-_]/g)
    .map((part) => (part.toLowerCase() === "grok" ? "Grok" : part))
    .join(" ");
}

export function mimeForImagePath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

export function grokPromptContent(prompt: string, imagePaths: string[] = []): unknown[] {
  const text = prompt.trim() === "" && imagePaths.length > 0 ? "See the attached image." : prompt;
  const blocks: unknown[] = [];
  if (text.trim() !== "") blocks.push({ type: "text", text });
  for (const path of imagePaths) {
    blocks.push({
      type: "image",
      mimeType: mimeForImagePath(path),
      data: readFileSync(path).toString("base64"),
    });
  }
  return blocks;
}

function toolStatus(value: unknown): GrokSessionItem["status"] {
  if (value === "completed") return "completed";
  if (value === "failed") return "failed";
  if (value === "pending") return "pending";
  return "inProgress";
}

function textFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value;
  return undefined;
}

function contentText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const entry of content) {
    if (!isRecord(entry)) continue;
    if (entry.type === "diff" && typeof entry.path === "string") {
      parts.push(entry.path);
      continue;
    }
    const inner = isRecord(entry.content) ? entry.content : entry;
    if (typeof inner.text === "string" && inner.text.trim() !== "") parts.push(inner.text);
  }
  return parts.length > 0 ? parts.join("\n") : undefined;
}

const KIND_TITLES: Record<string, string> = {
  read: "Read",
  edit: "Edit",
  delete: "Delete",
  move: "Move",
  search: "Search",
  execute: "Command",
  think: "Thinking",
  fetch: "Fetch",
};

export function humanizeMcpTitle(title: string): string {
  const trimmed = title.trim();
  const mcp = /^[A-Za-z0-9][A-Za-z0-9_-]*__([A-Za-z0-9_]+)$/.exec(trimmed);
  return mcp?.[1] ?? trimmed;
}

function firstLocationPath(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const entry of value) {
    if (isRecord(entry) && typeof entry.path === "string" && entry.path.trim() !== "") {
      return entry.path;
    }
  }
  return undefined;
}

function formatRawInput(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (!isRecord(value)) return undefined;
  const preferred = ["command", "path", "query", "pattern", "file", "target", "url", "prompt"];
  const parts: string[] = [];
  for (const key of preferred) {
    const entry = value[key];
    if (typeof entry === "string" && entry.trim() !== "") parts.push(entry);
  }
  if (parts.length > 0) return parts.join("\n");
  try {
    const json = JSON.stringify(value, null, 2);
    return json === "{}" ? undefined : json;
  } catch {
    return undefined;
  }
}

function toolTitleFromUpdate(update: Record<string, unknown>): string | undefined {
  const explicit = textFromUnknown(update.title);
  if (explicit) return humanizeMcpTitle(explicit);
  const named =
    textFromUnknown(update.toolName) ??
    textFromUnknown(update.name) ??
    textFromUnknown(isRecord(update._meta) ? update._meta.toolName : undefined);
  if (named) return humanizeMcpTitle(named);
  const kind = textFromUnknown(update.kind);
  const path = firstLocationPath(update.locations);
  if (kind && path) {
    const label = KIND_TITLES[kind] ?? kind;
    const base = path.split("/").pop() ?? path;
    return `${label} ${base}`;
  }
  if (kind && KIND_TITLES[kind]) return KIND_TITLES[kind];
  return undefined;
}

function toolDetailFromUpdate(update: Record<string, unknown>): string | undefined {
  return (
    contentText(update.content) ??
    firstLocationPath(update.locations) ??
    formatRawInput(update.rawInput)
  );
}

export function sessionUpdateToItem(params: unknown): GrokSessionItem | { kind: "text"; text: string } | { kind: "usage"; usage: TokenUsage } | null {
  if (!isRecord(params)) return null;
  const update = isRecord(params.update) ? params.update : params;
  const sessionUpdate = textFromUnknown(update.sessionUpdate);
  if (sessionUpdate === "agent_message_chunk") {
    const content = isRecord(update.content) ? update.content : undefined;
    const text = textFromUnknown(content?.text);
    return text ? { kind: "text", text } : null;
  }
  if (sessionUpdate === "agent_thought_chunk") {
    const content = isRecord(update.content) ? update.content : undefined;
    const text = textFromUnknown(content?.text);
    return text
      ? { itemId: "reasoning", kind: "reasoning", title: "Reasoning", status: "inProgress", text }
      : null;
  }
  if (sessionUpdate === "tool_call" || sessionUpdate === "tool_call_update") {
    const toolCallId = textFromUnknown(update.toolCallId);
    if (!toolCallId) return null;
    const title = toolTitleFromUpdate(update);
    const detail = toolDetailFromUpdate(update);
    const status =
      update.status !== undefined
        ? toolStatus(update.status)
        : sessionUpdate === "tool_call"
          ? "inProgress"
          : undefined;
    return {
      itemId: toolCallId,
      kind: "tool",
      ...(title ? { title } : {}),
      ...(detail ? { detail, text: detail } : {}),
      ...(status ? { status } : {}),
    };
  }
  const usage = usageFromUnknown(update.usage ?? params.usage);
  return usage ? { kind: "usage", usage } : null;
}

function usageFromUnknown(value: unknown): TokenUsage | null {
  if (!isRecord(value)) return null;
  const inputTokens = typeof value.inputTokens === "number" ? value.inputTokens : typeof value.input_tokens === "number" ? value.input_tokens : 0;
  const outputTokens = typeof value.outputTokens === "number" ? value.outputTokens : typeof value.output_tokens === "number" ? value.output_tokens : 0;
  const cacheReadTokens = typeof value.cachedInputTokens === "number" ? value.cachedInputTokens : typeof value.cache_read_input_tokens === "number" ? value.cache_read_input_tokens : 0;
  const cacheWriteTokens = typeof value.cacheCreationTokens === "number" ? value.cacheCreationTokens : typeof value.cache_creation_input_tokens === "number" ? value.cache_creation_input_tokens : 0;
  const reasoningTokens = typeof value.reasoningTokens === "number" ? value.reasoningTokens : typeof value.reasoning_tokens === "number" ? value.reasoning_tokens : 0;
  const totalTokens = typeof value.totalTokens === "number" ? value.totalTokens : typeof value.total_tokens === "number" ? value.total_tokens : inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens;
  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) return null;
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, totalTokens };
}

function authMethodId(authMethods: unknown, env: Record<string, string>): string | undefined {
  if (!Array.isArray(authMethods) || authMethods.length === 0) return undefined;
  const ids = authMethods.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string") return [];
    return [entry.id];
  });
  if (env.XAI_API_KEY?.trim() && ids.includes("xai.api_key")) return "xai.api_key";
  if (ids.includes("cached_token")) return "cached_token";
  return ids[0];
}

function agentCapabilities(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function hasResume(capabilities: Record<string, unknown>): boolean {
  const session = isRecord(capabilities.sessionCapabilities) ? capabilities.sessionCapabilities : undefined;
  return session?.resume !== undefined && session.resume !== false;
}

function permissionParams(params: unknown): {
  itemId: string;
  title: string;
  detail?: string;
  options: Array<{ optionId: string; name: string; kind?: string }>;
} | null {
  if (!isRecord(params)) return null;
  const toolCall = isRecord(params.toolCall) ? params.toolCall : undefined;
  const itemId = textFromUnknown(toolCall?.toolCallId) ?? "permission";
  const title = toolTitleFromUpdate(toolCall ?? {}) ?? "Approval needed";
  const detail = toolCall ? toolDetailFromUpdate(toolCall) : undefined;
  if (!Array.isArray(params.options)) return null;
  const options = params.options.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.optionId !== "string" || typeof entry.name !== "string") return [];
    return [{
      optionId: entry.optionId,
      name: entry.name,
      ...(typeof entry.kind === "string" ? { kind: entry.kind } : {}),
    }];
  });
  if (options.length === 0) return null;
  return { itemId, title, detail, options };
}

async function collectCommand(command: string, args: string[], env: Record<string, string>, timeoutMs: number): Promise<{ code: number; text: string } | null> {
  try {
    const proc = Bun.spawn([command, ...args], { env, stdout: "pipe", stderr: "pipe" });
    const text = Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]).then(([out, err]) => `${out}\n${err}`);
    const timed = await Promise.race([
      proc.exited.then(async (code) => ({ code, text: await text })),
      Bun.sleep(timeoutMs).then(() => null),
    ]);
    if (timed === null) {
      proc.kill();
      return null;
    }
    return timed;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { code: 127, text: message };
  }
}

export async function probeGrokCatalog(env: Record<string, string | undefined> = process.env): Promise<GrokCatalog> {
  const checkedAt = Date.now();
  const executable = env.GROK_PATH || "grok";
  const processEnv = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const versionResult = await collectCommand(executable, ["--version"], processEnv, 4000);
  if (!versionResult) {
    return { checkedAt, installed: true, message: "Grok CLI timed out while running `grok --version`.", models: [] };
  }
  if (versionResult.code !== 0 && /not found|ENOENT|command not found/i.test(versionResult.text)) {
    return { checkedAt, installed: false, message: "Grok CLI (`grok`) is not installed or not on PATH.", models: [] };
  }
  if (versionResult.code !== 0) {
    return {
      checkedAt,
      installed: true,
      version: parseGenericCliVersion(versionResult.text),
      message: "Grok CLI is installed but failed to run.",
      models: [],
    };
  }
  const version = parseGenericCliVersion(versionResult.text);
  const modelsResult = await collectCommand(executable, ["models"], processEnv, 8000);
  if (!modelsResult || modelsResult.code !== 0) {
    return {
      checkedAt,
      installed: true,
      version,
      message: "Grok CLI is installed but could not list models.",
      models: [],
    };
  }
  const parsed = parseGrokModelsCliOutput(modelsResult.text);
  if (parsed.authenticated === false) {
    return {
      checkedAt,
      installed: true,
      authenticated: false,
      version,
      message: "Grok CLI is installed but not logged in. Run `grok login`.",
      models: parsed.models,
    };
  }
  return {
    checkedAt,
    installed: true,
    authenticated: parsed.authenticated === true ? true : undefined,
    version,
    models: parsed.models,
  };
}

function spawnGrokAcp(opts: {
  workingDirectory: string;
  permissionMode: PermissionMode;
  env: Record<string, string>;
}): AcpProcess {
  const executable = opts.env.GROK_PATH || "grok";
  const proc = Bun.spawn([executable, ...grokAcpSpawnArgs(opts.permissionMode)], {
    cwd: opts.workingDirectory,
    env: {
      ...opts.env,
      GROK_DISABLE_AUTOUPDATER: "1",
    },
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    stdin: {
      write: (chunk: string) => {
        proc.stdin.write(chunk);
      },
      end: () => {
        proc.stdin.end();
      },
    },
    stdout: proc.stdout,
    stderr: proc.stderr,
    exited: proc.exited,
    kill: () => {
      proc.kill();
    },
  };
}

export async function runGrokAcpSession(opts: GrokAcpSessionOptions) {
  const env = Object.fromEntries(
    Object.entries(opts.env ?? process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const proc = spawnGrokAcp({
    workingDirectory: opts.workingDirectory,
    permissionMode: opts.permissionMode,
    env,
  });
  let replay = false;
  const client = createAcpClient(proc, {
    onNotification: (method, params) => {
      if (method !== "session/update" || replay) return;
      const folded = sessionUpdateToItem(params);
      if (!folded) return;
      if (folded.kind === "text") {
        opts.onText(folded.text);
        return;
      }
      if (folded.kind === "usage") {
        void opts.onUsage?.(folded.usage);
        return;
      }
      void opts.onItem(folded);
    },
    onRequest: async (method, params, id) => {
      if (method !== "session/request_permission") {
        throw new Error(`Unsupported ACP method ${method}`);
      }
      const permission = permissionParams(params);
      if (!permission) throw new Error("Invalid permission request.");
      const decision = await opts.waitForPermission({
        requestId: String(id),
        itemId: permission.itemId,
        title: permission.title,
        detail: permission.detail,
        options: permission.options,
      });
      if (decision.outcome === "cancelled") return { outcome: { outcome: "cancelled" } };
      return { outcome: { outcome: "selected", optionId: decision.optionId } };
    },
  });

  let watching = true;
  let currentSessionId = grokResumeId(opts.resumeSessionId) ?? "";
  const watchStop = (async () => {
    while (watching) {
      await Bun.sleep(400);
      if (!watching) return;
      const status = await opts.getStatus();
      if (status === "stopped" || status === "failed" || status === null) {
        try {
          if (currentSessionId !== "") client.notify("session/cancel", { sessionId: currentSessionId });
        } catch {
          // closing
        }
        return;
      }
    }
  })();
  try {
    const initialized = await client.request("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "factory", title: "Factory", version: "0.0.1" },
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
    });
    if (!isRecord(initialized)) throw new Error("Grok ACP initialize failed.");
    const capabilities = agentCapabilities(initialized.agentCapabilities);
    const methodId = authMethodId(initialized.authMethods, env);
    if (methodId) {
      await client.request("authenticate", { methodId });
    }
    const resumeId = grokResumeId(opts.resumeSessionId);
    if (resumeId && hasResume(capabilities)) {
      await client.request("session/resume", {
        sessionId: resumeId,
        cwd: opts.workingDirectory,
        mcpServers: [],
      });
      currentSessionId = resumeId;
    } else if (resumeId && capabilities.loadSession === true) {
      replay = true;
      await client.request("session/load", {
        sessionId: resumeId,
        cwd: opts.workingDirectory,
        mcpServers: [],
      });
      replay = false;
      currentSessionId = resumeId;
    } else {
      const created = await client.request("session/new", {
        cwd: opts.workingDirectory,
        mcpServers: [],
      });
      if (!isRecord(created) || typeof created.sessionId !== "string") {
        throw new Error("Grok ACP did not return a session id.");
      }
      currentSessionId = created.sessionId;
    }
    await opts.onSessionId(currentSessionId);
    if (opts.model.trim() !== "" && opts.model !== "grok-build") {
      try {
        await client.request("session/set_model", {
          sessionId: currentSessionId,
          modelId: opts.model,
          _meta: { reasoningEffort: grokEffortToken(opts.effort) },
        });
      } catch {
        // Older Grok CLIs may not implement session/set_model.
      }
    }
    const prompt = grokPromptContent(opts.prompt, opts.imagePaths);
    const result = await client.request("session/prompt", {
      sessionId: currentSessionId,
      prompt,
    });
    const usage = isRecord(result) ? usageFromUnknown(result.usage) : null;
    if (usage) await opts.onUsage?.(usage);
    const status = await opts.getStatus();
    if (status === "failed" || status === "stopped") return;
  } catch (error) {
    const detail = client.stderr().trim();
    const message = error instanceof Error ? error.message : "Grok Build Session failed.";
    if (/auth|login|unauthenticated/i.test(`${message}\n${detail}`)) {
      throw new Error("Grok Build is not signed in. Run `grok login` on this machine.");
    }
    throw new Error(message.includes("Grok Build") ? message : "Grok Build Session failed. Check the CLI installation, authentication, and model access.");
  } finally {
    watching = false;
    await client.close();
    await watchStop.catch(() => undefined);
  }
}

export { grokResumeId };
