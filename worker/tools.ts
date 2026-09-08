import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { AgentTool } from "./codingTools";

export type Question = {
  id: string;
  title: string;
  body: string;
  recommend: string;
};

export function factoryTools(
  client: ConvexHttpClient,
  runId: Id<"runs">,
): Record<string, AgentTool> {
  return {
    ask_human: {
      description:
        "Ask the human a frontier of questions. Blocks until they answer in the Factory UI.",
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["grill", "generic"] },
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                body: { type: "string" },
                recommend: { type: "string" },
              },
              required: ["id", "title", "body", "recommend"],
            },
          },
        },
        required: ["questions"],
      },
      async execute(input: Record<string, unknown>) {
        const questions = input.questions as Question[];
        const kind = (input.kind as "grill" | "generic" | undefined) ?? "grill";
        const askId = await client.mutation(api.worker.openAsk, {
          runId,
          kind,
          questions,
        });
        for (;;) {
          const ask = await client.query(api.worker.getAsk, { askId });
          if (ask?.status === "answered") {
            return JSON.stringify({ answers: ask.answers ?? [] });
          }
          await Bun.sleep(1000);
        }
      },
    },
    submit_artifact: {
      description:
        "Store a durable stage artifact. plan_verdict is JSON {size, specQuality}. spec and pr_url are text.",
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["plan_verdict", "spec", "pr_url"] },
          body: { type: "string" },
        },
        required: ["kind", "body"],
      },
      async execute(input: Record<string, unknown>) {
        const result = await client.mutation(api.worker.submitArtifact, {
          runId,
          kind: input.kind as "plan_verdict" | "spec" | "pr_url",
          body: String(input.body ?? ""),
        });
        return JSON.stringify(result);
      },
    },
    finish_stage: {
      description: "End this stage. Plan cannot finish without verdict, spec, and grill when required.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["finished", "failed"] },
          error: { type: "string" },
        },
        required: ["status"],
      },
      async execute(input: Record<string, unknown>) {
        await client.mutation(api.worker.finishStage, {
          runId,
          status: input.status as "finished" | "failed",
          error: input.error as string | undefined,
        });
        return "ok";
      },
    },
  };
}
