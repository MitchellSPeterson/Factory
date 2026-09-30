import { expect, test } from "bun:test";
import type { CodexOptions, ThreadOptions, ThreadEvent } from "@openai/codex-sdk";
import { runCodexAgent, type CodexAgentOptions } from "./codexAgent";
import { resolveProvider } from "../shared/agentModel";

function harness(events: ThreadEvent[], status = "finished") {
  let config: CodexOptions | undefined;
  let thread: ThreadOptions | undefined;
  let resumed: string | undefined;
  let prompt = "";
  const text: string[] = [], ids: string[] = [];
  const options: CodexAgentOptions = {
    runtime: "local", workingDirectory: "/project", model: "gpt-5.6-terra", effort: "low", prompt: "Review the change", env: { CODEX_API_KEY: "test", OPENAI_BASE_URL: "http://unrelated", PATH: "/bin" },
    onThreadId: async id => { ids.push(id); }, onText: value => text.push(value), getStatus: async () => status,
    createClient: value => { config = value; return { startThread(value) { thread = value; return { async runStreamed(value) { prompt = value; return { events: (async function* () { yield* events; })() }; } }; }, resumeThread(id, value) { resumed = id; thread = value; return { async runStreamed(value) { prompt = value; return { events: (async function* () { yield* events; })() }; } }; } }; },
  };
  return { options, text, ids, values: () => ({ config, thread, prompt, resumed }) };
}
const done: ThreadEvent = { type: "turn.completed", usage: { input_tokens: 1, cached_input_tokens: 0, cache_write_input_tokens: 0, output_tokens: 1, reasoning_output_tokens: 0 } };
test("Codex passes exact model/effort, Project, credentials, and streamed output", async () => {
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
  expect(h.values().config).toMatchObject({ apiKey: "test", config: { model_provider: "openai", service_tier: "default" } });
  expect(h.values().config?.env?.OPENAI_BASE_URL).toBeUndefined();
});
test("Codex rejects cloud Runs before launching", async () => {
  const h = harness([]); h.options.runtime = "cloud";
  await expect(runCodexAgent(h.options)).rejects.toThrow("local Session");
  expect(h.values().thread).toBeUndefined();
});
test("Codex rejects failed or truncated streams", async () => {
  await expect(runCodexAgent(harness([], "running").options)).rejects.toThrow("did not complete");
  await expect(runCodexAgent(harness([{ type: "turn.failed", error: { message: "private provider detail" } }]).options)).rejects.toThrow("Codex Session failed");
  await runCodexAgent(harness([done], "failed").options);
});
test("Session Codex resumes the thread and ", async () => {
  const h = harness([
    { type: "thread.started", thread_id: "codex-1" },
    { type: "item.completed", item: { type: "agent_message", id: "a", text: "Hi" } },
    done,
  ]);
  h.options.resumeThreadId = "codex-1";
  await runCodexAgent(h.options);
  expect(h.values().resumed).toBe("codex-1");
  expect(h.values().config?.config).toEqual({ model_provider: "openai", service_tier: "default" });
});

test("Session Codex maps full access and flex service tier", async () => {
  const h = harness([
    { type: "thread.started", thread_id: "codex-1" },
    { type: "item.completed", item: { type: "agent_message", id: "a", text: "Hi" } },
    done,
  ]);
  h.options.permissionMode = "full-access";
  h.options.serviceTier = "flex";
  await runCodexAgent(h.options);
  expect(h.values().thread).toMatchObject({ sandboxMode: "danger-full-access" });
  expect(h.values().config?.config).toEqual({ model_provider: "openai", service_tier: "flex" });
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
