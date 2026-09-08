import type { AgentTool } from "./codingTools";

const MAX_STEPS = 40;

export type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type OpenAIAgentOptions = {
  baseUrl: string;
  apiKey?: string;
  model: string;
  effort?: string;
  prompt: string;
  tools: Record<string, AgentTool>;
  onText?: (text: string) => void;
  fetchFn?: typeof fetch;
  maxSteps?: number;
  /** Prefer SSE; falls back to non-stream on failure. Default true. */
  stream?: boolean;
};

type ChatCompletionChoice = {
  message?: {
    role?: string;
    content?: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason?: string | null;
};

type ChatCompletionResponse = {
  choices?: ChatCompletionChoice[];
};

function toolsToOpenAI(tools: Record<string, AgentTool>) {
  return Object.entries(tools).map(([name, tool]) => ({
    type: "function" as const,
    function: {
      name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function chatCompletion(input: {
  baseUrl: string;
  apiKey?: string;
  model: string;
  effort?: string;
  messages: ChatMessage[];
  tools: Record<string, AgentTool>;
  fetchFn?: typeof fetch;
  stream?: boolean;
  onText?: (text: string) => void;
}): Promise<{ message: ChatMessage & { role: "assistant" }; finishReason: string | null }> {
  const fetchFn = input.fetchFn ?? fetch;
  const url = `${normalizeBaseUrl(input.baseUrl)}/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (input.apiKey) headers.Authorization = `Bearer ${input.apiKey}`;

  const body = {
    model: input.model,
    ...(input.effort ? { reasoning_effort: input.effort } : {}),
    messages: input.messages,
    tools: toolsToOpenAI(input.tools),
    tool_choice: "auto" as const,
    stream: input.stream === true,
  };

  const res = await fetchFn(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI chat/completions ${res.status}: ${text.slice(0, 500)}`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (input.stream === true && res.body && contentType.includes("text/event-stream")) {
    return await readStream(res, input.onText);
  }

  // Non-stream JSON (or servers that ignore stream=true)
  const data = (await res.json()) as ChatCompletionResponse;
  const choice = data.choices?.[0];
  if (!choice?.message) throw new Error("OpenAI response missing choices[0].message");
  const content = choice.message.content ?? null;
  if (content && input.onText) input.onText(content);
  return {
    message: {
      role: "assistant",
      content,
      tool_calls: choice.message.tool_calls,
    },
    finishReason: choice.finish_reason ?? null,
  };
}

async function readStream(
  res: Response,
  onText?: (text: string) => void,
): Promise<{ message: ChatMessage & { role: "assistant" }; finishReason: string | null }> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  const toolCalls = new Map<number, ToolCall>();
  let finishReason: string | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === "" || !trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;
      let chunk: {
        choices?: Array<{
          delta?: {
            content?: string;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              type?: string;
              function?: { name?: string; arguments?: string };
            }>;
          };
          finish_reason?: string | null;
        }>;
      };
      try {
        chunk = JSON.parse(payload) as typeof chunk;
      } catch {
        continue;
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) finishReason = choice.finish_reason;
      const delta = choice.delta;
      if (!delta) continue;
      if (delta.content) {
        content += delta.content;
        onText?.(delta.content);
      }
      for (const tc of delta.tool_calls ?? []) {
        const idx = tc.index ?? 0;
        const existing = toolCalls.get(idx) ?? {
          id: "",
          type: "function" as const,
          function: { name: "", arguments: "" },
        };
        if (tc.id) existing.id = tc.id;
        if (tc.function?.name) existing.function.name += tc.function.name;
        if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
        toolCalls.set(idx, existing);
      }
    }
  }

  const calls = [...toolCalls.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, tc]) => tc)
    .filter((tc) => tc.id !== "" && tc.function.name !== "");

  return {
    message: {
      role: "assistant",
      content: content === "" ? null : content,
      tool_calls: calls.length > 0 ? calls : undefined,
    },
    finishReason,
  };
}

export async function runOpenAIAgent(opts: OpenAIAgentOptions): Promise<"finished" | "failed"> {
  const fetchFn = opts.fetchFn ?? fetch;
  const maxSteps = opts.maxSteps ?? MAX_STEPS;
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You are a Factory coding agent. Use tools to inspect and edit the project. Call finish_stage when done. Call ask_human when you need the human.",
    },
    { role: "user", content: opts.prompt },
  ];

  let finished = false;

  for (let step = 0; step < maxSteps; step++) {
    const preferStream = opts.stream !== false;
    let result: Awaited<ReturnType<typeof chatCompletion>>;
    try {
      result = await chatCompletion({
        baseUrl: opts.baseUrl,
        apiKey: opts.apiKey,
        model: opts.model,
        effort: opts.effort,
        messages,
        tools: opts.tools,
        fetchFn,
        stream: preferStream,
        onText: opts.onText,
      });
    } catch (err) {
      if (!preferStream) throw err;
      // ponytail: many local servers lack SSE
      result = await chatCompletion({
        baseUrl: opts.baseUrl,
        apiKey: opts.apiKey,
        model: opts.model,
        effort: opts.effort,
        messages,
        tools: opts.tools,
        fetchFn,
        stream: false,
        onText: opts.onText,
      });
    }

    const assistant = result.message;
    messages.push(assistant);

    const calls = assistant.tool_calls ?? [];
    if (calls.length === 0) {
      if (result.finishReason === "stop") {
        throw new Error("Model stopped without calling finish_stage");
      }
      continue;
    }

    for (const call of calls) {
      const tool = opts.tools[call.function.name];
      let toolResult: string;
      if (!tool) {
        toolResult = JSON.stringify({ error: `unknown tool: ${call.function.name}` });
      } else {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          toolResult = JSON.stringify({ error: "invalid tool arguments JSON" });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: toolResult,
          });
          continue;
        }
        try {
          toolResult = await tool.execute(args);
          if (call.function.name === "finish_stage") finished = true;
        } catch (err) {
          toolResult = JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: toolResult,
      });
    }

    if (finished) return "finished";
  }

  throw new Error(`OpenAI agent exceeded ${maxSteps} steps without finish_stage`);
}
