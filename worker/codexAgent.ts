import { Codex, type CodexOptions, type ThreadOptions, type ThreadEvent } from "@openai/codex-sdk";
import path from "node:path";
import type { AGENT_EFFORTS } from "../convex/lib/agentModel";
import { addUsage, ZERO_USAGE } from "../convex/lib/tokenUsage";
import { fromCodexUsage } from "./usage";

type CodexClient = { startThread(options: ThreadOptions): { runStreamed(prompt: string): Promise<{ events: AsyncIterable<ThreadEvent> }> } };
export type CodexAgentOptions = {
  runtime: "local" | "cloud";
  root: string;
  workingDirectory: string;
  convexUrl: string;
  runId: string;
  model: string;
  effort: (typeof AGENT_EFFORTS)[number];
  prompt: string;
  env?: Record<string, string | undefined>;
  onThreadId: (id: string) => Promise<unknown>;
  onText: (text: string) => void;
  onUsage?: (usage: import("./usage").TokenUsage) => void | Promise<void>;
  getStatus: () => Promise<string | null>;
  createClient?: (options: CodexOptions) => CodexClient;
};

export async function runCodexAgent(opts: CodexAgentOptions) {
  if (opts.runtime !== "local") throw new Error("Codex requires a local Run on this machine.");
  const env = Object.fromEntries(Object.entries(opts.env ?? process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  // The OpenAI-compatible runner may target a different service on this worker.
  delete env.OPENAI_BASE_URL;
  const codex = (opts.createClient ?? (options => new Codex(options)))({
    apiKey: env.CODEX_API_KEY || env.OPENAI_API_KEY || undefined,
    baseUrl: env.CODEX_BASE_URL || undefined,
    codexPathOverride: env.CODEX_PATH || undefined,
    env,
    config: {
      model_provider: "openai",
      mcp_servers: {
        factory: {
          command: process.execPath,
          args: [path.join(opts.root, "worker/mcpStdio.mjs")],
          env: { CONVEX_URL: opts.convexUrl, FACTORY_RUN_ID: opts.runId, FACTORY_MCP_TRANSPORT: "jsonl" },
          required: true,
          // Human Asks can remain pending overnight.
          tool_timeout_sec: 604800,
        },
      },
    },
  });
  const thread = codex.startThread({
    model: opts.model,
    modelReasoningEffort: opts.effort,
    workingDirectory: opts.workingDirectory,
    sandboxMode: "workspace-write",
    approvalPolicy: "never",
    networkAccessEnabled: true,
  });
  const { events } = await thread.runStreamed(opts.prompt);
  const seenText = new Map<string, string>();
  let completed = false;
  let usage = ZERO_USAGE;
  for await (const event of events) {
    if (event.type === "thread.started") await opts.onThreadId(event.thread_id);
    if (event.type === "error" || event.type === "turn.failed") {
      throw new Error("Codex Run failed. Check Codex authentication, model access, and worker configuration.");
    }
    if (event.type === "turn.completed") {
      completed = true;
      const turn = fromCodexUsage(event.usage);
      if (turn) usage = addUsage(usage, turn);
    }
    if (event.type === "item.started" || event.type === "item.updated" || event.type === "item.completed") {
      const item = event.item;
      if (item.type === "agent_message" || item.type === "reasoning") {
        const previous = seenText.get(item.id) ?? "";
        const delta = item.text.startsWith(previous) ? item.text.slice(previous.length) : item.text;
        opts.onText(delta);
        seenText.set(item.id, item.text);
        if (event.type === "item.completed") opts.onText("\n");
      } else if (event.type === "item.started" && item.type === "mcp_tool_call") {
        opts.onText(`\n[${item.server}: ${item.tool}]\n`);
      } else if (event.type === "item.completed" && item.type === "file_change") {
        opts.onText(`\n${item.changes.map(change => `${change.kind}: ${change.path}`).join("\n")}\n`);
      }
    }
  }
  await opts.onUsage?.(usage);
  const status = await opts.getStatus();
  if (status === "failed") return;
  if (!completed || status !== "finished") throw new Error("Codex stopped without completing the Stage through finish_stage.");
}
