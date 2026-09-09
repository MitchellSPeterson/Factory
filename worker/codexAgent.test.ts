import { expect, test } from "bun:test";
import type { CodexOptions, ThreadOptions, ThreadEvent } from "@openai/codex-sdk";
import { runCodexAgent, type CodexAgentOptions } from "./codexAgent";
import { resolveProvider } from "../convex/lib/agentModel";

function harness(events: ThreadEvent[], status = "finished") {
  let config: CodexOptions | undefined;
  let thread: ThreadOptions | undefined;
  let prompt = "";
  const text: string[] = [], ids: string[] = [];
  const options: CodexAgentOptions = {
    runtime: "local", root: "/factory", workingDirectory: "/project", convexUrl: "https://example.convex.cloud", runId: "run-1", model: "gpt-5.6-terra", effort: "low", prompt: "Review the change", env: { CODEX_API_KEY: "test", OPENAI_BASE_URL: "http://unrelated", PATH: "/bin" },
    onThreadId: async id => { ids.push(id); }, onText: value => text.push(value), getStatus: async () => status,
    createClient: value => { config = value; return { startThread(value) { thread = value; return { async runStreamed(value) { prompt = value; return { events: (async function* () { yield* events; })() }; } }; } }; },
  };
  return { options, text, ids, values: () => ({ config, thread, prompt }) };
}
const done: ThreadEvent = { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 } };
test("Codex passes exact model/effort, Project, MCP identity, credentials, and streamed output", async () => {
  const h = harness([
    { type: "thread.started", thread_id: "codex-1" },
    { type: "item.updated", item: { type: "agent_message", id: "a", text: "Hello" } },
    { type: "item.completed", item: { type: "agent_message", id: "a", text: "Hello Factory" } }, done,
  ]);
  await runCodexAgent(h.options);
  expect(h.ids).toEqual(["codex-1"]);
  expect(h.text.join("")).toBe("Hello Factory\n");
  expect(h.values().thread).toMatchObject({ model: "gpt-5.6-terra", modelReasoningEffort: "low", workingDirectory: "/project", sandboxMode: "workspace-write", approvalPolicy: "never" });
  expect(h.values().prompt).toBe("Review the change");
  expect(h.values().config).toMatchObject({ apiKey: "test", config: { mcp_servers: { factory: { required: true, env: { FACTORY_RUN_ID: "run-1", FACTORY_MCP_TRANSPORT: "jsonl" } } } } });
  expect(h.values().config?.env?.OPENAI_BASE_URL).toBeUndefined();
});
test("Codex rejects cloud Runs before launching", async () => {
  const h = harness([]); h.options.runtime = "cloud";
  await expect(runCodexAgent(h.options)).rejects.toThrow("local Run");
  expect(h.values().thread).toBeUndefined();
});
test("Codex requires backend Stage completion and rejects failed or truncated streams", async () => {
  await expect(runCodexAgent(harness([done], "running").options)).rejects.toThrow("finish_stage");
  await expect(runCodexAgent(harness([], "running").options)).rejects.toThrow("finish_stage");
  await expect(runCodexAgent(harness([{ type: "turn.failed", error: { message: "private provider detail" } }]).options)).rejects.toThrow("Codex Run failed");
  await runCodexAgent(harness([done], "failed").options);
});
test("Codex accumulates turn usage", async () => {
  const seen: unknown[] = [];
  const h = harness([
    { type: "thread.started", thread_id: "codex-1" },
    { type: "item.completed", item: { type: "agent_message", id: "a", text: "Hi" } },
    done,
    { type: "turn.completed", usage: { input_tokens: 4, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 2, reasoning_output_tokens: 0 } },
  ]);
  h.options.onUsage = (usage) => { seen.push(usage); };
  await runCodexAgent(h.options);
  expect(seen).toEqual([{
    inputTokens: 5,
    outputTokens: 3,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    totalTokens: 8,
  }]);
});
