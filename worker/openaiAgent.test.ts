import { describe, expect, test } from "bun:test";
import { resolveInCwd } from "./codingTools";
import { runOpenAIAgent, type ChatMessage } from "./openaiAgent";
import type { AgentTool } from "./codingTools";

describe("resolveInCwd", () => {
  test("allows relative paths under cwd", () => {
    expect(resolveInCwd("/tmp/proj", "src/a.ts")).toBe("/tmp/proj/src/a.ts");
  });

  test("rejects path escape", () => {
    expect(() => resolveInCwd("/tmp/proj", "../etc/passwd")).toThrow(/escapes/);
  });
});

describe("runOpenAIAgent", () => {
  test("tool call then finish_stage", async () => {
    const executed: string[] = [];
    const texts: string[] = [];
    let calls = 0;

    const tools: Record<string, AgentTool> = {
      list_dir: {
        description: "list",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
        },
        async execute(input) {
          executed.push(`list:${String(input.path ?? ".")}`);
          return "f README.md";
        },
      },
      finish_stage: {
        description: "done",
        inputSchema: {
          type: "object",
          properties: { status: { type: "string" } },
          required: ["status"],
        },
        async execute(input) {
          executed.push(`finish:${String(input.status)}`);
          return "ok";
        },
      },
    };

    const fetchFn: typeof fetch = async (_url, init) => {
      calls += 1;
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        messages: ChatMessage[];
        reasoning_effort: string;
      };
      expect(body.reasoning_effort).toBe("high");
      if (calls === 1) {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "looking around",
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: {
                        name: "list_dir",
                        arguments: JSON.stringify({ path: "." }),
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      const last = body.messages[body.messages.length - 1];
      expect(last?.role).toBe("tool");
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: "done",
                tool_calls: [
                  {
                    id: "call_2",
                    type: "function",
                    function: {
                      name: "finish_stage",
                      arguments: JSON.stringify({ status: "finished" }),
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const status = await runOpenAIAgent({
      baseUrl: "http://example.invalid/v1",
      model: "test-model",
      effort: "high",
      prompt: "do the job",
      tools,
      fetchFn,
      stream: false,
      onText: (t) => texts.push(t),
    });

    expect(status).toBe("finished");
    expect(executed).toEqual(["list:.", "finish:finished"]);
    expect(texts.join("")).toContain("looking around");
    expect(calls).toBe(2);
  });
});
