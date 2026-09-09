import { Agent } from "@cursor/sdk";
import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { resolveProvider, type AgentProvider, type AGENT_EFFORTS, toModelSelection } from "../convex/lib/agentModel";
import { codingTools } from "./codingTools";
import { createLiveLog } from "./liveLog";
import { runCodexAgent } from "./codexAgent";
import { runOpenAIAgent } from "./openaiAgent";
import { assemblePrompt, buildLaunchPrompt } from "./prompt";
import { loadSkillFiles } from "./seedSkills";
import { environmentFor, importTick, loadIdentity, type WorkerIdentity } from "./managed";
import { factoryTools } from "./tools";
import { fromCursorUsage, type TokenUsage } from "./usage";
import { ZERO_USAGE } from "../convex/lib/tokenUsage";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ponytail: Bun loads .env not .env.local; mirror verify-factory
function loadEnvLocal() {
  try {
    const text = readFileSync(path.join(root, ".env.local"), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match?.[1] || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2] ?? "";
    }
  } catch {
    // no .env.local
  }
}
loadEnvLocal();

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
  effort: (typeof AGENT_EFFORTS)[number];
  provider?: AgentProvider;
  project: {
    id: Id<"projects">;
    serverId?: Id<"servers">;
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

function convexUrl(): string {
  const url = process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
  if (!url) throw new Error("CONVEX_URL missing. Run convex dev first.");
  return url;
}

async function reportUsage(
  client: ConvexHttpClient,
  runId: Id<"runs">,
  usage: TokenUsage | null | undefined,
) {
  if (!usage) return;
  await client.mutation(api.worker.recordUsage, { runId, usage });
}

async function reportLaunchContext(
  client: ConvexHttpClient,
  runId: Id<"runs">,
  launch: Pick<Launch, "stageKey" | "request" | "acceptedSpec" | "skills" | "project">,
) {
  const { segments } = buildLaunchPrompt({
    stageKey: launch.stageKey,
    request: launch.request,
    projectName: launch.project.name,
    projectKind: launch.project.kind,
    acceptedSpec: launch.acceptedSpec,
    skills: launch.skills,
  });
  await client.mutation(api.worker.recordContext, {
    runId,
    breakdown: { estimated: true, segments },
  });
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
    await tools.ask_human!.execute({
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

async function runOpenAI(client: ConvexHttpClient, launch: Launch) {
  if (launch.runtime === "cloud") {
    throw new Error("FACTORY_PROVIDER=openai only supports runtime local");
  }
  const baseUrl = requireEnv("OPENAI_BASE_URL");
  const model =
    launch.model.trim() !== ""
      ? launch.model
      : process.env.OPENAI_MODEL?.trim() || "";
  if (model === "") {
    throw new Error("model is empty; set Workflow/Stage model or OPENAI_MODEL");
  }

  await client.mutation(api.worker.bindAgent, {
    runId: launch.runId,
    agentId: `openai-${launch.runId}`,
  });

  const tools = {
    ...factoryTools(client, launch.runId),
    ...codingTools(launch.project.localPath),
  };
  const prompt = assemblePrompt({
    stageKey: launch.stageKey,
    request: launch.request,
    projectName: launch.project.name,
    projectKind: launch.project.kind,
    acceptedSpec: launch.acceptedSpec,
    skills: launch.skills,
  });
  await reportLaunchContext(client, launch.runId, launch);

  const log = createLiveLog((text) =>
    client.mutation(api.worker.appendMessage, {
      runId: launch.runId,
      text,
    }),
  );
  try {
    await runOpenAIAgent({
      baseUrl,
      apiKey: process.env.OPENAI_API_KEY,
      model,
      effort: launch.effort,
      prompt,
      tools,
      onText: (text) => log.push(text),
      onUsage: (usage) => reportUsage(client, launch.runId, usage),
      pullNotes: async () => {
        const rows = await client.mutation(api.worker.takeAgentInput, {
          runId: launch.runId,
          limit: 10,
        });
        return rows.map((row) => row.text);
      },
    });
  } finally {
    await log.close();
  }
}

async function runCursor(client: ConvexHttpClient, launch: Launch, projectEnv: Record<string, string> = {}) {
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
  await reportLaunchContext(client, launch.runId, launch);

  const model = toModelSelection(launch.model, launch.effort);

  const mcpServers = {
    factory: {
      type: "stdio" as const,
      command: "node",
      args: [path.join(root, "worker/mcpStdio.mjs")],
      env: {
        CONVEX_URL: convexUrl(),
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
            envVars: projectEnv,
            repos: [
              {
                url: `https://github.com/${launch.project.githubRepo}`,

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
  let usage = ZERO_USAGE;
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
      if (event.type === "usage") {
        const next = fromCursorUsage(event.usage);
        if (next) usage = next;
      }
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
    const finalUsage = fromCursorUsage(result.usage) ?? usage;
    await reportUsage(client, launch.runId, finalUsage);
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

async function runCodex(client: ConvexHttpClient, launch: Launch) {
  const log = createLiveLog(text => client.mutation(api.worker.appendMessage, { runId: launch.runId, text }));
  try {
    await reportLaunchContext(client, launch.runId, launch);
    await runCodexAgent({
      ...launch,
      root,
      workingDirectory: launch.project.localPath,
      convexUrl: client.url,
      prompt: assemblePrompt({ stageKey: launch.stageKey, request: launch.request, projectName: launch.project.name, projectKind: launch.project.kind, acceptedSpec: launch.acceptedSpec, skills: launch.skills }),
      onThreadId: agentId => client.mutation(api.worker.bindAgent, { runId: launch.runId, agentId }),
      onText: text => log.push(text),
      onUsage: usage => reportUsage(client, launch.runId, usage),
      getStatus: () => client.query(api.worker.getRunStatus, { runId: launch.runId }),
    });
  } finally {
    await log.close();
  }
}

// Each Run gets its own process so one Project's environment cannot leak into
// another Run, and settings updates do not mutate an active Run.
async function execute(client: ConvexHttpClient, launch: Launch, projectEnv: Record<string, string>) {
  const provider = resolveProvider(launch.provider, process.env.FACTORY_PROVIDER);
  if (process.env.FACTORY_MOCK === "1") await mockRun(client, launch);
  else if (provider === "codex") await runCodex(client, launch);
  else if (provider === "openai") await runOpenAI(client, launch);
  else if (!process.env.CURSOR_API_KEY) throw new Error("Set CURSOR_API_KEY in Settings → Worker environment before starting a Run.");
  else await runCursor(client, launch, projectEnv);
}
async function tick(client: ConvexHttpClient, identity: WorkerIdentity) {
  const queued = await client.query(api.worker.listQueued, {});
  for (const runId of queued) {
    const launch = await client.mutation(api.worker.claim, { runId, accessKey: identity.accessKey });
    if (!launch) continue;
    try {
      const values = await environmentFor(client, identity, launch.project.serverId ? launch.project.id : undefined);
      const proc = Bun.spawn([process.execPath, path.join(root, "worker/index.ts"), "--execute"], {
        stdin: "pipe", stdout: "ignore", stderr: "ignore",
        env: { ...process.env, ...values.server, ...values.project },
      });
      proc.stdin.write(JSON.stringify({ launch, projectEnv: values.project, convexUrl: identity.convexUrl }));
      proc.stdin.end();
      let exitCode: number | undefined;
      const exited = proc.exited.then((code) => {
        exitCode = code;
        return code;
      });
      while (exitCode === undefined) {
        await Promise.race([exited, Bun.sleep(500)]);
        if (exitCode !== undefined) break;
        const status = await client.query(api.worker.getRunStatus, { runId: launch.runId });
        if (status === null || status === "failed") {
          proc.kill("SIGTERM");
          break;
        }
      }
      if (await exited !== 0) throw new Error("Run failed. Check the worker environment, provider credentials, and Project configuration.");
    } catch {
      await client.mutation(api.worker.failRun, { runId: launch.runId, error: "Run failed. Check worker environment settings and provider credentials." });
    }
  }
}
async function main() {
  if (process.argv.includes("--execute")) {
    const payload = JSON.parse(await Bun.stdin.text()) as { launch: Launch; projectEnv: Record<string, string>; convexUrl: string };
    const client = new ConvexHttpClient(payload.convexUrl);
    try { await execute(client, payload.launch, payload.projectEnv); } catch { process.exitCode = 1; }
    return;
  }
  const urlIndex = process.argv.indexOf("--url");
  const url = urlIndex >= 0 ? process.argv[urlIndex + 1] : process.env.CONVEX_URL ?? process.env.VITE_CONVEX_URL;
  const identity = await loadIdentity(root, url);
  if (process.argv.includes("--pair")) { console.log(identity.accessKey); return; }
  const client = new ConvexHttpClient(identity.convexUrl);
  await client.mutation(api.servers.register, { accessKey: identity.accessKey, name: identity.name, publicKey: identity.publicKey, projectsRoot: identity.projectsRoot });
  await seed(client);
  console.log("Factory worker ready. Pair in Settings using the key from: bun run worker:pair");
  // Imports and heartbeats continue while a long-running agent is active.
  const heartbeat = setInterval(() => { void client.mutation(api.servers.heartbeat, { accessKey: identity.accessKey }).catch(() => {}); }, 15_000);
  async function imports() { for (;;) { try { await importTick(client, identity); } catch { console.error("Import synchronization failed; retrying."); } await Bun.sleep(1500); } }
  void imports();
  try { for (;;) { try { await tick(client, identity); } catch { console.error("Worker synchronization failed; retrying."); } await Bun.sleep(1500); } }
  finally { clearInterval(heartbeat); }
}

void main().catch(() => { console.error("Worker startup failed. Check the deployment connection and worker identity, then restart."); process.exitCode = 1; });
