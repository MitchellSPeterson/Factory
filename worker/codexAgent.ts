import { Codex, type CodexOptions, type Input, type ThreadOptions, type ThreadEvent } from "@openai/codex-sdk";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type AGENT_EFFORTS,
  codexSandboxMode,
  codexServiceTierConfig,
} from "../shared/agentModel";
import type { PermissionMode, ServiceTier } from "../shared/validators";
import { addUsage, ZERO_USAGE } from "../shared/tokenUsage";
import { fromCodexUsage } from "./usage";
import { codexItemToSessionItem, type SessionItem } from "./sessionItems";

type ThreadHandle = { runStreamed(input: Input): Promise<{ events: AsyncIterable<ThreadEvent> }> };
type CodexClient = {
  startThread(options: ThreadOptions): ThreadHandle;
  resumeThread?: (id: string, options?: ThreadOptions) => ThreadHandle;
};
export type CodexAgentOptions = {
  runtime: "local" | "cloud";
  root: string;
  workingDirectory: string;
  convexUrl: string;
  runId?: string;
  mode?: "stage" | "session";
  resumeThreadId?: string;
  model: string;
  effort: (typeof AGENT_EFFORTS)[number];
  permissionMode?: PermissionMode;
  serviceTier?: ServiceTier;
  prompt: string;
  imagePaths?: string[];
  env?: Record<string, string | undefined>;
  onThreadId: (id: string) => Promise<unknown>;
  onText: (text: string) => void;
  /** Session chats: tool calls and reasoning arrive as structured rows instead of log text. */
  onItem?: (item: SessionItem) => Promise<unknown>;
  onUsage?: (usage: import("./usage").TokenUsage) => void | Promise<void>;
  getStatus: () => Promise<string | null>;
  createClient?: (options: CodexOptions) => CodexClient;
};

// The SDK's bundled binary lags the installed CLI, which owns the model list the picker shows.
function codexBin(env: Record<string, string>) {
  const local = path.join(os.homedir(), ".local/bin/codex");
  return env.CODEX_PATH || (existsSync(local) ? local : undefined);
}

export async function runCodexAgent(opts: CodexAgentOptions) {
  const mode = opts.mode ?? "stage";
  if (opts.runtime !== "local") throw new Error(mode === "session" ? "Codex requires a local Session on this machine." : "Codex requires a local Run on this machine.");
  const env = Object.fromEntries(Object.entries(opts.env ?? process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  // The OpenAI-compatible runner may target a different service on this worker.
  delete env.OPENAI_BASE_URL;
  const permissionMode = opts.permissionMode ?? "supervised";
  const serviceTier = opts.serviceTier ?? "standard";
  const config: CodexOptions["config"] = {
    model_provider: "openai",
    service_tier: codexServiceTierConfig(serviceTier),
  };
  if (mode === "stage" && opts.runId) {
    config.mcp_servers = {
      factory: {
        command: process.execPath,
        args: [path.join(opts.root, "worker/mcpStdio.mjs")],
        env: { CONVEX_URL: opts.convexUrl, FACTORY_RUN_ID: opts.runId, FACTORY_MCP_TRANSPORT: "jsonl" },
        required: true,
        // Human Asks can remain pending overnight.
        tool_timeout_sec: 604800,
      },
    };
  }
  const codex = (opts.createClient ?? (options => new Codex(options)))({
    apiKey: env.CODEX_API_KEY || env.OPENAI_API_KEY || undefined,
    baseUrl: env.CODEX_BASE_URL || undefined,
    codexPathOverride: codexBin(env),
    env,
    config,
  });
  const threadOptions: ThreadOptions = {
    model: opts.model,
    modelReasoningEffort: opts.effort,
    workingDirectory: opts.workingDirectory,
    sandboxMode: codexSandboxMode(permissionMode),
    approvalPolicy: "never",
    networkAccessEnabled: true,
  };
  const thread = opts.resumeThreadId && codex.resumeThread
    ? codex.resumeThread(opts.resumeThreadId, threadOptions)
    : codex.startThread(threadOptions);
  const imagePaths = opts.imagePaths ?? [];
  const input: Input = imagePaths.length === 0
    ? opts.prompt
    : [
        { type: "text", text: opts.prompt.trim() === "" ? "See the attached image." : opts.prompt },
        ...imagePaths.map((path) => ({ type: "local_image" as const, path })),
      ];
  const { events } = await thread.runStreamed(input);
  const seenText = new Map<string, string>();
  let completed = false;
  let usage = ZERO_USAGE;
  for await (const event of events) {
    if (event.type === "thread.started") await opts.onThreadId(event.thread_id);
    if (event.type === "error" || event.type === "turn.failed") {
      console.error("Codex failed:", event.type === "error" ? event.message : event.error.message);
      throw new Error(mode === "session" ? "Codex Session failed. Check Codex authentication, model access, and worker configuration." : "Codex Run failed. Check Codex authentication, model access, and worker configuration.");
    }
    if (event.type === "turn.completed") {
      completed = true;
      const turn = fromCodexUsage(event.usage);
      if (turn) usage = addUsage(usage, turn);
    }
    if (event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") {
      const item = event.item;
      const completedEvent = event.type === "item.completed";
      if (item.type === "agent_message" || item.type === "reasoning") {
        const previous = seenText.get(item.id) ?? "";
        const delta = item.text.startsWith(previous) ? item.text.slice(previous.length) : item.text;
        seenText.set(item.id, item.text);
        if (item.type === "reasoning" && opts.onItem) {
          await opts.onItem({ itemId: item.id, kind: "reasoning", title: "Reasoning", status: completedEvent ? "completed" : "inProgress", text: delta });
        } else {
          opts.onText(delta);
          if (completedEvent) opts.onText("\n");
        }
      } else if (opts.onItem) {
        const mapped = codexItemToSessionItem(item, completedEvent);
        if (mapped) await opts.onItem(mapped);
      } else if (event.type === "item.started" && item.type === "mcp_tool_call") {
        opts.onText(`\n[${item.server}: ${item.tool}]\n`);
      } else if (completedEvent && item.type === "file_change") {
        opts.onText(`\n${item.changes.map(change => `${change.kind}: ${change.path}`).join("\n")}\n`);
      }
    }
  }
  await opts.onUsage?.(usage);
  const status = await opts.getStatus();
  if (status === "failed" || status === "stopped") return;
  if (mode === "session") {
    if (!completed) throw new Error("Codex Session turn did not complete.");
    return;
  }
  if (!completed || status !== "finished") throw new Error("Codex stopped without completing the Stage through finish_stage.");
}
