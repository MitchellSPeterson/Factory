import path from "node:path";
import type { AGENT_EFFORTS } from "../convex/lib/agentModel";
import type { TokenUsage } from "./usage";

export type GrokAgentOptions = {
  runtime: "local" | "cloud";
  root: string;
  workingDirectory: string;
  convexUrl: string;
  runId: string;
  model: string;
  effort: (typeof AGENT_EFFORTS)[number];
  prompt: string;
  env?: Record<string, string | undefined>;
  onSessionId: (id: string) => Promise<unknown>;
  onText: (text: string) => void;
  onUsage?: (usage: TokenUsage) => void | Promise<void>;
  getStatus: () => Promise<string | null>;
};

type GrokEvent = {
  type?: string;
  data?: string;
  sessionId?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    reasoning_tokens?: number;
    total_tokens?: number;
  };
};

export function grokRules(root: string) {
  const bridge = path.join(root, "worker/grokBridge.ts");
  return `You are running as a VASA Factory Agent. Complete the requested Stage in the current Project. Use the normal file and terminal tools for project work. Factory lifecycle tools are terminal commands of the form: bun ${JSON.stringify(bridge)} <tool> '<json>'. Available tools: ask_human {"kind":"grill"|"generic","questions":[{"id","title","body","recommend"}]}; submit_artifact {"kind":"plan_verdict"|"spec"|"pr_url","body":"..."}; finish_stage {"status":"finished"|"failed","error":"optional"}. You MUST call finish_stage exactly once. Planning Stages must submit their required verdict and spec first; PR Stages must submit the PR URL. Use ask_human when the Stage requires user input.`;
}

export function parseGrokEvent(line: string): GrokEvent | null {
  try { return JSON.parse(line) as GrokEvent; } catch { return null; }
}

function tokenUsage(event: GrokEvent): TokenUsage | null {
  const usage = event.usage;
  if (!usage) return null;
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = usage.cache_creation_input_tokens ?? 0;
  const reasoningTokens = usage.reasoning_tokens ?? 0;
  return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, reasoningTokens, totalTokens: usage.total_tokens ?? inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens };
}

export async function runGrokAgent(opts: GrokAgentOptions) {
  if (opts.runtime !== "local") throw new Error("Grok Build requires a local Run on this machine.");
  const env = Object.fromEntries(Object.entries(opts.env ?? process.env).filter((entry): entry is [string, string] => entry[1] !== undefined));
  const executable = env.GROK_PATH || "grok";
  const effort = opts.effort === "ultra" ? "max" : opts.effort;
  const proc = Bun.spawn([
    executable, "-p", opts.prompt, "--cwd", opts.workingDirectory, "--model", opts.model,
    "--effort", effort, "--output-format", "streaming-json", "--always-approve",
    "--no-plan", "--no-subagents", "--no-auto-update", "--rules", grokRules(opts.root),
  ], {
    cwd: opts.workingDirectory,
    env: { ...env, CONVEX_URL: opts.convexUrl, FACTORY_RUN_ID: opts.runId, GROK_DISABLE_AUTOUPDATER: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderrText = new Response(proc.stderr).text();

  let buffer = "";
  let finalUsage: TokenUsage | null = null;
  const reader = proc.stdout.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += new TextDecoder().decode(value);
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const event = parseGrokEvent(line);
      if (event?.type === "text" && event.data) opts.onText(event.data);
      if (event?.sessionId) await opts.onSessionId(event.sessionId);
      const usage = event ? tokenUsage(event) : null;
      if (usage) finalUsage = usage;
    }
  }
  const exitCode = await proc.exited;
  if (finalUsage) await opts.onUsage?.(finalUsage);
  if (exitCode !== 0) {
    const detail = (await stderrText).trim();
    throw new Error(detail.includes("auth") ? "Grok Build is not signed in. Run `grok login` on this machine." : "Grok Build Run failed. Check the CLI installation, authentication, and model access.");
  }
  const status = await opts.getStatus();
  if (status === "failed") return;
  if (status !== "finished") throw new Error("Grok Build stopped without completing the Stage through finish_stage.");
}
