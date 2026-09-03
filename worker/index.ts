import { Agent } from "@cursor/sdk";
import { ConvexHttpClient } from "convex/browser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { toModelSelection } from "../convex/lib/agentModel";
import { createLiveLog } from "./liveLog";
import { assemblePrompt } from "./prompt";
import { loadSkillFiles } from "./seedSkills";
import { factoryTools } from "./tools";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Launch = {
  runId: Id<"runs">;
  jobId: Id<"jobs">;
  stageKey: string;
  runtime: "local" | "cloud";
  grillAttached: boolean;
  request: string;
  acceptedSpec?: string;
  forceGrill: boolean;
  model: string;
  effort: string;
  project: {
    name: string;
    kind: "expo" | "web" | "mixed";
    localPath: string;
    githubRepo: string;
  };
  skills: Array<{ slug: string; title: string; body: string }>;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function seed(client: ConvexHttpClient) {
  const skills = await loadSkillFiles(root);
  await client.mutation(api.seed.ensure, { skills });
  try {
    await client.mutation(api.jobs.migrateLanes, {});
  } catch {
    // ponytail: convex may still be compiling on first boot
  }
}

async function mockRun(client: ConvexHttpClient, launch: Launch) {
  await client.mutation(api.worker.bindAgent, {
    runId: launch.runId,
    agentId: `mock-${launch.runId}`,
  });
  await client.mutation(api.worker.appendMessage, {
    runId: launch.runId,
    text: `mock ${launch.stageKey} started`,
  });

  if (launch.stageKey === "plan") {
    const tools = factoryTools(client, launch.runId);
    await tools.ask_human.execute({
      kind: "grill",
      questions: [
        {
          id: "q1",
          title: "What should this Job actually ship?",
          body: "The request is large and the spec is thin. Pick the outcome.",
          recommend: "Ship the smallest slice named in the request.",
        },
      ],
    });
    await client.mutation(api.worker.submitArtifact, {
      runId: launch.runId,
      kind: "plan_verdict",
      body: JSON.stringify({ size: "large", specQuality: "thin" }),
    });
    await client.mutation(api.worker.submitArtifact, {
      runId: launch.runId,
      kind: "spec",
      body: `# Spec\n\n${launch.request}\n`,
    });
    await client.mutation(api.worker.finishStage, {
      runId: launch.runId,
      status: "finished",
    });
    return;
  }

  if (launch.stageKey === "pr") {
    await client.mutation(api.worker.submitArtifact, {
      runId: launch.runId,
      kind: "pr_url",
      body: "https://example.invalid/pr/1",
    });
  }
  await client.mutation(api.worker.finishStage, {
    runId: launch.runId,
    status: "finished",
  });
}

async function runCursor(client: ConvexHttpClient, launch: Launch) {
  const apiKey = requireEnv("CURSOR_API_KEY");
  const tools = factoryTools(client, launch.runId);
  const prompt = assemblePrompt({
    stageKey: launch.stageKey,
    request: launch.request,
    projectName: launch.project.name,
    projectKind: launch.project.kind,
    acceptedSpec: launch.acceptedSpec,
    skills: launch.skills,
  });

  const model = toModelSelection(launch.model, launch.effort);

  const mcpServers = {
    factory: {
      type: "stdio" as const,
      command: "node",
      args: [path.join(root, "worker/mcpStdio.mjs")],
      env: {
        CONVEX_URL: requireEnv("CONVEX_URL"),
        FACTORY_RUN_ID: launch.runId,
      },
    },
  };

  const agent =
    launch.runtime === "cloud"
      ? await Agent.create({
          apiKey,
          model,
          cloud: {
            repos: [
              {
                url: `https://github.com/${launch.project.githubRepo}`,
                startingRef: "main",
              },
            ],
            autoCreatePR: launch.stageKey === "pr",
          },
          mcpServers,
        })
      : await Agent.create({
          apiKey,
          model,
          local: {
            cwd: launch.project.localPath,
            customTools: tools,
          },
        });

  await client.mutation(api.worker.bindAgent, {
    runId: launch.runId,
    agentId: agent.agentId,
  });

  const log = createLiveLog((text) =>
    client.mutation(api.worker.appendMessage, {
      runId: launch.runId,
      text,
    }),
  );
  let live = false;
  const run = await agent.send(prompt, {
    onDelta: ({ update }) => {
      if (update.type === "text-delta" || update.type === "thinking-delta") {
        live = true;
        log.push(update.text);
      }
    },
  });
  await client.mutation(api.worker.bindAgent, {
    runId: launch.runId,
    agentId: agent.agentId,
    cursorRunId: run.id,
  });
  try {
    for await (const event of run.stream()) {
      if (live) continue;
      if (event.type === "assistant") {
        for (const block of event.message.content) {
          if (block.type === "text" && block.text.trim() !== "") {
            log.push(block.text);
          }
        }
      }
      if (event.type === "thinking" && event.text.trim() !== "") {
        log.push(event.text);
      }
    }
    await log.close();
    const result = await run.wait();
    if (result.status === "error") {
      await client.mutation(api.worker.failRun, {
        runId: launch.runId,
        error: "Cursor run failed",
      });
    }
  } finally {
    await log.close();
    await agent[Symbol.asyncDispose]();
  }
}

async function tick(client: ConvexHttpClient) {
  const queued = await client.query(api.worker.listQueued, {});
  for (const runId of queued) {
    const launch = await client.mutation(api.worker.claim, { runId });
    if (!launch) continue;
    const mock = process.env.FACTORY_MOCK === "1" || !process.env.CURSOR_API_KEY;
    try {
      if (mock) await mockRun(client, launch);
      else await runCursor(client, launch);
    } catch (err) {
      await client.mutation(api.worker.failRun, {
        runId: launch.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

async function main() {
  const url = requireEnv("CONVEX_URL");
  const client = new ConvexHttpClient(url);
  await seed(client);
  console.log("factory worker seeded, polling");
  for (;;) {
    try {
      await tick(client);
    } catch (err) {
      console.error(err);
    }
    await Bun.sleep(1500);
  }
}

void main();
