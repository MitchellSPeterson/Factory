import { startTerminals } from "./terminals";
import { Agent } from "@cursor/sdk";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "../shared/mailboxApi";
import type { Doc, SessionView } from "../shared/dataModel";
import type { Id } from "../shared/ids";
import { type AGENT_EFFORTS, toModelSelection } from "../shared/agentModel";
import { implementPrompt, parsePlan, parseVerdict, planPrompt, reviewPrompt, testsPrompt, uiReviewPrompt, type Verdict } from "../shared/helix";
import { httpMailbox, mailboxForRoot, type Mailbox } from "./mailbox/client";
import { codingTools } from "./codingTools";
import { createLiveLog } from "./liveLog";
import { runCodexAgent } from "./codexAgent";
import { grokResumeId } from "./grokAgent";
import { runGrokAcpSession } from "./grokAcp";
import { claudeBin, collectProviderModels } from "./providerModels";
import { collectProviderUsage } from "./providerUsage";
import { runOpenAIAgent } from "./openaiAgent";
import { cursorImagesFromPaths, cursorUserMessage } from "./cursorMessage";
import { globalSkillDirs, listRepoSkills } from "./repoSkills";
import { loadSkillFiles } from "./seedSkills";
import { environmentFor, importTick, loadIdentity, type WorkerIdentity } from "./managed";
import { setKeepAwake, startPairingHub } from "./pairing";
import { defaultSimRunner, reconcileSimHub } from "./simHub";
import { executeProjectOperation, startProjectOperations } from "./projectOperations";
import { startDeviceHub } from "./deviceHub";
import { fromCursorUsage, type TokenUsage } from "./usage";
import { ZERO_USAGE } from "../shared/tokenUsage";

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

type SessionLaunch = {
  sessionId: Id<"sessions">;
  prompt: string;
  provider: "grok" | "codex" | "cursor" | "claude" | "openai";
  model: string;
  effort: (typeof AGENT_EFFORTS)[number];
  permissionMode: "supervised" | "auto-accept-edits" | "auto" | "full-access";
  serviceTier: "standard" | "flex" | "priority";
  agentId?: string;
  images: Array<{ url: string }>;
  project: {
    id: Id<"projects">;
    serverId?: Id<"servers">;
    name: string;
    kind: "expo" | "web" | "mixed";
    localPath: string;
    githubRepo: string;
  };
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function seed(client: Mailbox) {
  const skills = await loadSkillFiles(root);
  await client.mutation(api.seed.ensure, { skills });
}


async function reportSessionUsage(
  client: Mailbox,
  sessionId: Id<"sessions">,
  usage: TokenUsage | null | undefined,
) {
  if (!usage) return;
  await client.mutation(api.sessions.recordUsage, { sessionId, usage });
}

async function mockSession(client: Mailbox, launch: SessionLaunch) {
  await client.mutation(api.sessions.bindAgent, {
    sessionId: launch.sessionId,
    agentId: `mock-${launch.sessionId}`,
  });
  await client.mutation(api.sessions.appendMessage, {
    sessionId: launch.sessionId,
    text: `mock ${launch.provider} reply`,
  });
  await client.mutation(api.sessions.complete, { sessionId: launch.sessionId });
}

async function materializeImages(images: Array<{ url: string }>): Promise<string[]> {
  if (images.length === 0) return [];
  const dir = mkdtempSync(path.join(os.tmpdir(), "factory-session-"));
  const files: string[] = [];
  for (const [index, image] of images.entries()) {
    const response = await fetch(image.url);
    if (!response.ok) throw new Error("Could not load an attached image.");
    const type = response.headers.get("content-type") ?? "";
    const ext = type.includes("jpeg") ? "jpg" : type.includes("webp") ? "webp" : type.includes("gif") ? "gif" : "png";
    const file = path.join(dir, `image-${index}.${ext}`);
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    files.push(file);
  }
  return files;
}

async function waitForSessionPermission(
  client: Mailbox,
  sessionId: Id<"sessions">,
  requestId: string,
): Promise<{ outcome: "selected"; optionId: string } | { outcome: "cancelled" }> {
  for (;;) {
    const status = await client.query(api.sessions.getStatus, { sessionId });
    if (status !== "running") return { outcome: "cancelled" };
    const decision = await client.query(api.sessions.getPermission, { sessionId, requestId });
    if (decision?.status === "resolved" || decision?.status === "denied") {
      if (decision.optionId) return { outcome: "selected", optionId: decision.optionId };
      return { outcome: "cancelled" };
    }
    await Bun.sleep(400);
  }
}

async function runSessionGrok(client: Mailbox, launch: SessionLaunch) {
  const log = createLiveLog(text => client.mutation(api.sessions.appendMessage, { sessionId: launch.sessionId, text }));
  try {
    await runGrokAcpSession({
      workingDirectory: launch.project.localPath,
      resumeSessionId: grokResumeId(launch.agentId),
      model: launch.model,
      effort: launch.effort,
      permissionMode: launch.permissionMode,
      prompt: launch.prompt,
      imagePaths: await materializeImages(launch.images),
      onSessionId: agentId => client.mutation(api.sessions.bindAgent, { sessionId: launch.sessionId, agentId: `grok-${agentId}` }),
      onText: text => log.push(text),
      onItem: item => client.mutation(api.sessions.upsertItem, {
        sessionId: launch.sessionId,
        itemId: item.itemId,
        kind: item.kind,
        title: item.title,
        detail: item.detail,
        status: item.status,
        text: item.text,
        requestId: item.requestId,
        options: item.options,
      }),
      onUsage: usage => reportSessionUsage(client, launch.sessionId, usage),
      waitForPermission: async (input) => {
        await client.mutation(api.sessions.upsertItem, {
          sessionId: launch.sessionId,
          itemId: input.itemId,
          kind: "permission",
          title: input.title,
          detail: input.detail,
          status: "pending",
          text: input.detail ?? input.title,
          requestId: input.requestId,
          options: input.options,
        });
        return waitForSessionPermission(client, launch.sessionId, input.requestId);
      },
      getStatus: () => client.query(api.sessions.getStatus, { sessionId: launch.sessionId }),
    });
    await client.mutation(api.sessions.complete, { sessionId: launch.sessionId });
  } finally {
    await log.close();
  }
}

async function runSessionCodex(client: Mailbox, launch: SessionLaunch) {
  const log = createLiveLog(text => client.mutation(api.sessions.appendMessage, { sessionId: launch.sessionId, text }));
  try {
    await runCodexAgent({
      runtime: "local",
      root,
      workingDirectory: launch.project.localPath,
      convexUrl: client.url,
      mode: "session",
      resumeThreadId: launch.agentId,
      model: launch.model,
      effort: launch.effort,
      permissionMode: launch.permissionMode,
      serviceTier: launch.serviceTier,
      prompt: launch.prompt,
      imagePaths: await materializeImages(launch.images),
      onThreadId: agentId => client.mutation(api.sessions.bindAgent, { sessionId: launch.sessionId, agentId }),
      onText: text => log.push(text),
      onUsage: usage => reportSessionUsage(client, launch.sessionId, usage),
      getStatus: () => client.query(api.sessions.getStatus, { sessionId: launch.sessionId }),
    });
    await client.mutation(api.sessions.complete, { sessionId: launch.sessionId });
  } finally {
    await log.close();
  }
}

async function runSessionCursor(client: Mailbox, launch: SessionLaunch) {
  if (!process.env.CURSOR_API_KEY) {
    throw new Error("Set CURSOR_API_KEY in Settings → Worker environment before starting a chat.");
  }
  const apiKey = requireEnv("CURSOR_API_KEY");
  const model = toModelSelection(launch.model, launch.effort);
  const local = { cwd: launch.project.localPath };
  const agent = launch.agentId
    ? await Agent.resume(launch.agentId, { apiKey, model, local })
    : await Agent.create({ apiKey, model, local });
  await client.mutation(api.sessions.bindAgent, {
    sessionId: launch.sessionId,
    agentId: agent.agentId,
  });
  const log = createLiveLog((text) =>
    client.mutation(api.sessions.appendMessage, { sessionId: launch.sessionId, text }),
  );
  let live = false;
  let usage = ZERO_USAGE;
  const run = await agent.send(
    cursorUserMessage(launch.prompt, cursorImagesFromPaths(await materializeImages(launch.images))),
    {
    model,
    onDelta: ({ update }) => {
      if (update.type === "text-delta" || update.type === "thinking-delta") {
        live = true;
        log.push(update.text);
      }
    },
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
          if (block.type === "text" && block.text.trim() !== "") log.push(block.text);
        }
      }
      if (event.type === "thinking" && event.text.trim() !== "") log.push(event.text);
    }
    const result = await run.wait();
    await reportSessionUsage(client, launch.sessionId, fromCursorUsage(result.usage) ?? usage);
    if (result.status === "error") throw new Error("Cursor chat failed");
    await client.mutation(api.sessions.complete, { sessionId: launch.sessionId });
  } finally {
    await log.close();
    await agent[Symbol.asyncDispose]();
  }
}

async function runSessionClaude(client: Mailbox, launch: SessionLaunch) {
  const bin = claudeBin();
  const log = createLiveLog((text) =>
    client.mutation(api.sessions.appendMessage, { sessionId: launch.sessionId, text }),
  );
  try {
    const agentId = launch.agentId && !launch.agentId.startsWith("claude-")
      ? launch.agentId
      : randomUUID();
    await client.mutation(api.sessions.bindAgent, {
      sessionId: launch.sessionId,
      agentId,
    });
    const args = [bin, "-p", launch.prompt, "--output-format", "text", "--model", launch.model,
      "--effort", launch.effort === "ultra" ? "max" : launch.effort,
      // full-access never blocks on a permission prompt; -p has no tty to show one on anyway. Other modes are left
      // to the CLI's own default (fine for a human watching; not wired here for the "ask" case).
      ...(launch.permissionMode === "full-access" ? ["--permission-mode", "bypassPermissions"] : []),
      ...(launch.agentId === agentId ? ["--resume", agentId] : ["--session-id", agentId])];
    const proc = Bun.spawn(args, {
      cwd: launch.project.localPath,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      if (text) log.push(text);
    }
    const code = await proc.exited;
    if (code !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(err.trim().slice(0, 280) || "Claude Code failed. Install the Claude CLI and sign in from Settings.");
    }
    await client.mutation(api.sessions.complete, { sessionId: launch.sessionId });
  } finally {
    await log.close();
  }
}

async function runSessionOpenAI(client: Mailbox, launch: SessionLaunch) {
  const baseUrl = requireEnv("OPENAI_BASE_URL");
  const model = launch.model.trim() || process.env.OPENAI_MODEL?.trim() || "";
  if (model === "") throw new Error("Set a model for the OpenAI-compatible provider.");
  const log = createLiveLog((text) =>
    client.mutation(api.sessions.appendMessage, { sessionId: launch.sessionId, text }),
  );
  try {
    await client.mutation(api.sessions.bindAgent, {
      sessionId: launch.sessionId,
      agentId: `openai-${launch.sessionId}`,
    });
    await runOpenAIAgent({
      baseUrl,
      apiKey: process.env.OPENAI_API_KEY,
      model,
      effort: launch.effort,
      prompt: launch.prompt,
      tools: codingTools(launch.project.localPath),
      onText: (text) => log.push(text),
      onUsage: (usage) => reportSessionUsage(client, launch.sessionId, usage),
    });
    await client.mutation(api.sessions.complete, { sessionId: launch.sessionId });
  } finally {
    await log.close();
  }
}

async function executeSession(client: Mailbox, launch: SessionLaunch) {
  if (process.env.FACTORY_MOCK === "1") await mockSession(client, launch);
  else if (launch.provider === "grok") await runSessionGrok(client, launch);
  else if (launch.provider === "cursor") await runSessionCursor(client, launch);
  else if (launch.provider === "claude") await runSessionClaude(client, launch);
  else if (launch.provider === "openai") await runSessionOpenAI(client, launch);
  else await runSessionCodex(client, launch);
}

async function tick(client: Mailbox, identity: WorkerIdentity) {
  const queuedSessions = await client.query(api.sessions.listQueued, {});
  for (const sessionId of queuedSessions) {
    const launch = await client.mutation(api.sessions.claim, { sessionId, accessKey: identity.accessKey });
    if (!launch) continue;
    try {
      const values = await environmentFor(client, identity, launch.project.serverId ? launch.project.id : undefined);
      const proc = Bun.spawn([process.execPath, path.join(root, "worker/index.ts"), "--execute-session"], {
        stdin: "pipe", stdout: "ignore", stderr: "ignore",
        env: { ...process.env, ...values.server, ...values.project },
      });
      proc.stdin.write(JSON.stringify({ launch, workerUrl: `http://127.0.0.1:${process.env.FACTORY_PAIR_PORT || 3402}`, token: identity.pairingToken }));
      proc.stdin.end();
      let exitCode: number | undefined;
      const exited = proc.exited.then((code) => {
        exitCode = code;
        return code;
      });
      while (exitCode === undefined) {
        await Promise.race([exited, Bun.sleep(500)]);
        if (exitCode !== undefined) break;
        const status = await client.query(api.sessions.getStatus, { sessionId: launch.sessionId });
        if (status === null || status === "failed" || status === "stopped") {
          proc.kill("SIGTERM");
          break;
        }
      }
      if (await exited !== 0) {
        const status = await client.query(api.sessions.getStatus, { sessionId: launch.sessionId });
        if (status !== "failed" && status !== "stopped") {
          throw new Error("Session failed. Check the worker environment, provider credentials, and Project configuration.");
        }
      }
    } catch {
      await client.mutation(api.sessions.fail, { sessionId: launch.sessionId, error: "Session failed. Check worker environment settings and provider credentials." });
    }
  }
}
// check and commit run shell/git commands directly (no Session), so a slow one must not be started twice by the
// next 1.5s tick, and must not block other Builds from advancing in the same tick.
const buildStepsInFlight = new Set<Id<"builds">>();

function lastAssistantText(view: SessionView | null): string {
  const last = view?.messages.filter((m) => m.role === "assistant" && (m.kind === undefined || m.kind === "message")).at(-1);
  return String(last?.text ?? "");
}

function existingGuides(worktree: string): string {
  return ["CONTEXT.md", "AGENTS.md", "CLAUDE.md", "docs/adr", "LEARNINGS.md", "DESIGN.md"]
    .filter((name) => existsSync(path.join(worktree, name)))
    .join(", ");
}

// ponytail: no existing shell helper is both timeout-capped at 15 minutes and truncated to 4000 chars; the closest
// (executeProjectOperation's internal run()) is hardcoded to 2 minutes. This is the minimal one for the check gate.
async function runCheckCommand(command: string, cwd: string): Promise<{ pass: boolean; output: string }> {
  if (command.trim() === "") return { pass: true, output: "" };
  try {
    const proc = Bun.spawn(["sh", "-c", command], { cwd, stdout: "pipe", stderr: "pipe" });
    const text = Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]).then(
      ([out, err]) => `${out}\n${err}`,
    );
    const timed = await Promise.race([
      proc.exited.then(async (code) => ({ code, text: await text })),
      Bun.sleep(15 * 60_000).then(() => null),
    ]);
    if (timed === null) {
      proc.kill();
      return { pass: false, output: "Check command timed out after 15 minutes." };
    }
    return { pass: timed.code === 0, output: timed.text.slice(-4000) };
  } catch (error) {
    return { pass: false, output: error instanceof Error ? error.message : "Check command failed to run." };
  }
}

async function runGitCommit(cwd: string, message: string): Promise<string> {
  const add = Bun.spawn(["git", "add", "-A"], { cwd, stdout: "ignore", stderr: "pipe" });
  if ((await add.exited) !== 0) throw new Error((await new Response(add.stderr).text()).trim() || "git add failed.");
  const status = Bun.spawn(["git", "status", "--porcelain"], { cwd, stdout: "pipe", stderr: "ignore" });
  const dirty = (await new Response(status.stdout).text()).trim() !== "";
  await status.exited;
  if (dirty) {
    const commit = Bun.spawn(["git", "commit", "-m", message], { cwd, stdout: "pipe", stderr: "pipe" });
    if ((await commit.exited) !== 0) {
      throw new Error((await new Response(commit.stderr).text()).trim() || "git commit failed.");
    }
  }
  const rev = Bun.spawn(["git", "rev-parse", "--short", "HEAD"], { cwd, stdout: "pipe", stderr: "pipe" });
  const sha = (await new Response(rev.stdout).text()).trim();
  if ((await rev.exited) !== 0 || !sha) throw new Error("Could not read the commit sha.");
  return sha;
}

async function ensureWorktree(
  client: Mailbox,
  identity: WorkerIdentity,
  build: Doc<"builds">,
  project: Doc<"projects">,
): Promise<string> {
  const slug = build.branch.replace(/^build\//, "") || "build";
  for (let attempt = 1; attempt <= 20; attempt++) {
    const suffix = attempt === 1 ? "" : `-${attempt}`;
    const name = `${slug}${suffix}`;
    const branch = `${build.branch}${suffix}`;
    try {
      await executeProjectOperation(project.localPath, { kind: "createWorktree", name, branch, createBranch: true });
      const worktree = path.resolve(path.dirname(project.localPath), `${path.basename(project.localPath)}-${name}`);
      await client.mutation(api.builds.mark, { accessKey: identity.accessKey, buildId: build._id, worktree });
      return worktree;
    } catch {
      // Branch or worktree path already exists (e.g. a retried build); try the next suffix.
    }
  }
  throw new Error("Could not create a worktree: too many naming collisions.");
}

async function startBuildStep(
  client: Mailbox,
  identity: WorkerIdentity,
  build: Doc<"builds">,
  worktree: string,
): Promise<void> {
  const step = build.step;
  if (step.kind === "plan" || step.kind === "writeTests" || step.kind === "implement" || step.kind === "review") {
    const item = await client.query(api.roadmap.getItem, { itemId: build.roadmapItemId });
    if (!item) throw new Error("Roadmap Item not found.");
    if (step.kind === "plan") {
      // ponytail: a crash between sessions.create and builds.mark leaves an orphan queued Session; the next tick
      // (started still false) creates another. Rare and harmless — worst case two Plan Sessions in the UI.
      const sessionId = await client.mutation(api.sessions.create, {
        projectId: build.projectId,
        provider: build.agent.provider,
        model: build.agent.model,
        effort: build.agent.effort,
        permissionMode: "full-access",
        text: planPrompt(item, build, step.feedback),
        cwd: worktree,
        title: step.feedback ? "Build · Replan" : "Build · Plan",
        roadmapItemId: build.roadmapItemId,
        accessKey: identity.accessKey,
      });
      await client.mutation(api.builds.mark, { accessKey: identity.accessKey, buildId: build._id, started: true, sessionIds: [sessionId] });
      return;
    }
    if (step.kind === "writeTests") {
      // ponytail: same crash window as the plan Step above.
      const sessionId = await client.mutation(api.sessions.create, {
        projectId: build.projectId,
        provider: build.agent.provider,
        model: build.agent.model,
        effort: build.agent.effort,
        permissionMode: "full-access",
        text: testsPrompt(item, build),
        cwd: worktree,
        title: `Build · Tests ${build.current + 1}`,
        roadmapItemId: build.roadmapItemId,
        accessKey: identity.accessKey,
      });
      await client.mutation(api.builds.mark, { accessKey: identity.accessKey, buildId: build._id, started: true, sessionIds: [sessionId] });
      return;
    }
    if (step.kind === "implement") {
      // Always a fresh Session — never resumed, even for a fixer.
      const sessionId = await client.mutation(api.sessions.create, {
        projectId: build.projectId,
        provider: build.agent.provider,
        model: build.agent.model,
        effort: build.agent.effort,
        permissionMode: "full-access",
        text: implementPrompt(item, build, step.message),
        cwd: worktree,
        title: `Build · ${step.message ? "Fix" : "Implement"} ${build.current + 1}`,
        roadmapItemId: build.roadmapItemId,
        accessKey: identity.accessKey,
      });
      await client.mutation(api.builds.mark, {
        accessKey: identity.accessKey,
        buildId: build._id,
        checkpointSessionId: sessionId,
        started: true,
        sessionIds: [sessionId],
      });
      return;
    }
    // review
    const cp = build.checkpoints[build.current]!;
    const guides = existingGuides(worktree);
    const sessionIds: Id<"sessions">[] = [];
    for (const [i, reviewer] of build.reviewers.entries()) {
      // ponytail: same crash window; a lost mark here would leave one reviewer Session untracked.
      const sessionId = await client.mutation(api.sessions.create, {
        projectId: build.projectId,
        provider: reviewer.provider,
        model: reviewer.model,
        effort: reviewer.effort,
        permissionMode: "full-access",
        text: reviewPrompt(cp, guides),
        cwd: worktree,
        title: `Build · ${build.current + 1} · Reviewer ${i === 0 ? "A" : "B"}`,
        roadmapItemId: build.roadmapItemId,
        accessKey: identity.accessKey,
      });
      sessionIds.push(sessionId);
    }
    await client.mutation(api.builds.mark, { accessKey: identity.accessKey, buildId: build._id, started: true, sessionIds });
    return;
  }
  if (step.kind === "uiReview") {
    const cp = build.checkpoints[build.current]!;
    const roles = ["visual", "behavior"] as const;
    const sessionIds: Id<"sessions">[] = [];
    for (const [i, role] of roles.entries()) {
      const reviewer = build.reviewers[i]!;
      // ponytail: same crash window as the review Step above.
      const sessionId = await client.mutation(api.sessions.create, {
        projectId: build.projectId,
        provider: reviewer.provider,
        model: reviewer.model,
        effort: reviewer.effort,
        permissionMode: "full-access",
        text: uiReviewPrompt(cp, role),
        cwd: worktree,
        title: `Build · UI review ${build.current + 1} · ${role === "visual" ? "Visual" : "Behavior"}`,
        roadmapItemId: build.roadmapItemId,
        accessKey: identity.accessKey,
      });
      sessionIds.push(sessionId);
    }
    await client.mutation(api.builds.mark, { accessKey: identity.accessKey, buildId: build._id, started: true, sessionIds });
    return;
  }
  if (step.kind === "check") {
    if (buildStepsInFlight.has(build._id)) return;
    buildStepsInFlight.add(build._id);
    void (async () => {
      try {
        const { pass, output } = await runCheckCommand(build.checkCommand, worktree);
        await client.mutation(api.builds.send, { buildId: build._id, event: { kind: "checked", pass, output } });
      } catch (error) {
        await client.mutation(api.builds.send, {
          buildId: build._id,
          event: { kind: "failed", error: error instanceof Error ? error.message : "Check command failed." },
        });
      } finally {
        buildStepsInFlight.delete(build._id);
      }
    })();
    return;
  }
  if (step.kind === "commit") {
    if (buildStepsInFlight.has(build._id)) return;
    buildStepsInFlight.add(build._id);
    void (async () => {
      try {
        const cp = build.checkpoints[build.current]!;
        const message = `${cp.title}\n\nBuild: ${build.title}, Checkpoint ${build.current + 1}/${build.checkpoints.length}`;
        const sha = await runGitCommit(worktree, message);
        await client.mutation(api.builds.send, { buildId: build._id, event: { kind: "committed", sha } });
      } catch (error) {
        await client.mutation(api.builds.send, {
          buildId: build._id,
          event: { kind: "failed", error: error instanceof Error ? error.message : "Commit failed." },
        });
      } finally {
        buildStepsInFlight.delete(build._id);
      }
    })();
    return;
  }
  // approvePlan / finalReview / done: the Worker has nothing to do; the page or advance() moves these along.
}

async function pollBuildStep(client: Mailbox, build: Doc<"builds">): Promise<void> {
  if (build.sessionIds.length === 0) return;
  const statuses = await Promise.all(build.sessionIds.map((sessionId) => client.query(api.sessions.getStatus, { sessionId })));
  const failedAt = statuses.findIndex((status) => status === "failed" || status === "stopped" || status === null);
  if (failedAt !== -1) {
    const view = await client.query(api.sessions.get, { sessionId: build.sessionIds[failedAt]! });
    await client.mutation(api.builds.send, {
      buildId: build._id,
      event: { kind: "failed", error: `${view?.session.title ?? "Session"} failed` },
    });
    return;
  }
  if (!statuses.every((status) => status === "idle")) return;
  const views = await Promise.all(build.sessionIds.map((sessionId) => client.query(api.sessions.get, { sessionId })));
  const texts = views.map((view) => lastAssistantText(view));
  const step = build.step;
  if (step.kind === "plan") {
    const checkpoints = parsePlan(texts[0] ?? "");
    if (!checkpoints) {
      await client.mutation(api.builds.send, { buildId: build._id, event: { kind: "failed", error: "The planner didn't return a plan." } });
      return;
    }
    await client.mutation(api.builds.send, { buildId: build._id, event: { kind: "planned", checkpoints } });
  } else if (step.kind === "writeTests") {
    await client.mutation(api.builds.send, { buildId: build._id, event: { kind: "testsWritten" } });
  } else if (step.kind === "implement") {
    await client.mutation(api.builds.send, { buildId: build._id, event: { kind: "implemented" } });
  } else if (step.kind === "uiReview" || step.kind === "review") {
    const verdicts = texts.map((text) => parseVerdict(text));
    if (verdicts.some((verdict) => verdict === null)) {
      await client.mutation(api.builds.send, { buildId: build._id, event: { kind: "failed", error: "A reviewer didn't return a verdict." } });
      return;
    }
    await client.mutation(api.builds.send, { buildId: build._id, event: { kind: "reviewed", verdicts: verdicts as Verdict[] } });
  }
}

async function buildsTick(client: Mailbox, identity: WorkerIdentity) {
  const builds = await client.query(api.builds.listActive, { accessKey: identity.accessKey });
  for (const build of builds) {
    try {
      const project = await client.query(api.projects.get, { projectId: build.projectId });
      if (!project) throw new Error("Project not found.");
      const worktree = build.worktree ?? (await ensureWorktree(client, identity, build, project));
      if (!build.started) await startBuildStep(client, identity, build, worktree);
      else await pollBuildStep(client, build);
    } catch (error) {
      await client.mutation(api.builds.send, {
        buildId: build._id,
        event: { kind: "failed", error: error instanceof Error ? error.message : "Build step failed." },
      });
    }
  }
}

async function waitForIdentity() {
  return await loadIdentity(root);
}

async function main() {
  if (process.argv.includes("--execute-session")) {
    const payload = JSON.parse(await Bun.stdin.text()) as { launch: SessionLaunch; workerUrl: string; token: string };
    const client = httpMailbox(payload.workerUrl, payload.token);
    try {
      await executeSession(client, payload.launch);
    } catch (error) {
      process.exitCode = 1;
      const raw = error instanceof Error ? error.message.trim() : "";
      const message = raw === "" ? "Session failed. Check worker environment settings and provider credentials." : raw.slice(0, 280);
      try {
        await client.mutation(api.sessions.fail, { sessionId: payload.launch.sessionId, error: message });
      } catch {
        // tick reports the generic failure if this mutation does not land
      }
    }
    return;
  }
  const stopPairing = await startPairingHub(root);
  const identity = await waitForIdentity();
  if (identity.keepAwake !== false) setKeepAwake(true);
  const client = mailboxForRoot(root, `http://127.0.0.1:${process.env.FACTORY_PAIR_PORT || 3402}`);
  await client.mutation(api.servers.register, { accessKey: identity.accessKey, name: identity.name, publicKey: identity.publicKey, projectsRoot: identity.projectsRoot });
  await seed(client);
  console.log("Factory worker ready.");
  const stopDeviceHub = await startDeviceHub().catch((error: unknown) => {
    console.error("Device Hub could not start:", error instanceof Error ? error.message : String(error));
    return () => {};
  });
  // Imports and heartbeats continue while a long-running agent is active.
  const heartbeat = setInterval(() => {
    void (async () => {
      const live = await loadIdentity(root);
      await client.mutation(api.servers.register, {
        accessKey: live.accessKey,
        name: live.name,
        publicKey: live.publicKey,
        projectsRoot: live.projectsRoot,
      });
    })().catch(() => {});
  }, 15_000);
  async function imports() {
    for (;;) {
      try {
        await importTick(client, await loadIdentity(root));
      } catch {
        console.error("Import synchronization failed; retrying.");
      }
      await Bun.sleep(1500);
    }
  }
  void imports();
  const stopProjectOperations = startProjectOperations(client, identity);
  const stopTerminals = startTerminals(client, identity);
  let lastProviderProbe = 0;
  let lastDisabled = "";
  let lastSimHub = 0;
  let lastSimRunning = false;
  let lastSkillsScan = 0;
  const lastSkills = new Map<string, string>();
  async function providerTick() {
    const disabled = (await client.query(api.servers.paired, { accessKey: identity.accessKey })).providersDisabled ?? [];
    // Re-probe right away when a provider is toggled in Settings.
    if (Date.now() - lastProviderProbe < 60_000 && disabled.join() === lastDisabled) return;
    lastProviderProbe = Date.now();
    lastDisabled = disabled.join();
    let env: Record<string, string | undefined> = { ...process.env };
    try {
      const values = await environmentFor(client, identity);
      env = { ...env, ...values.server };
    } catch {
      // Worker environment may be empty until variables are saved.
    }
    try {
      const models = await collectProviderModels(env, disabled);
      await client.mutation(api.servers.reportProviderModels, { accessKey: identity.accessKey, models });
    } catch {
      console.error("Provider model probe failed; retrying.");
    }
    try {
      const usage = await collectProviderUsage({ env });
      await client.mutation(api.servers.reportProviderUsage, { accessKey: identity.accessKey, usage });
    } catch (error) {
      console.error("Provider usage probe failed:", error instanceof Error ? error.message : error);
    }
  }
  async function skillsTick() {
    if (Date.now() - lastSkillsScan < 30_000) return;
    lastSkillsScan = Date.now();
    const extras = globalSkillDirs();
    try {
      const projects = await client.query(api.projects.list, {});
      for (const project of projects) {
        try {
          const skills = await listRepoSkills(project.localPath, extras);
          const key = JSON.stringify(skills);
          if (lastSkills.get(project._id) === key) continue;
          await client.mutation(api.projects.reportSkills, {
            accessKey: identity.accessKey,
            projectId: project._id,
            skills,
          });
          lastSkills.set(project._id, key);
        } catch {
          console.error(`Could not list Skills for ${project.name}.`);
        }
      }
    } catch {
      console.error("Project Skill scan failed; retrying.");
    }
  }
  async function simHubTick() {
    try {
      const work = await client.mutation(api.servers.claimDeviceCommands, { accessKey: identity.accessKey });
      const due = work.wanted !== lastSimRunning || Date.now() - lastSimHub > (work.wanted ? 2500 : 15000) || work.commands.length > 0;
      if (!due) return;
      lastSimHub = Date.now();
      const { hub, results } = await reconcileSimHub({ wanted: work.wanted, commands: work.commands, runner: defaultSimRunner() });
      lastSimRunning = hub.running;
      await client.mutation(api.servers.reportSimHub, { accessKey: identity.accessKey, hub });
      for (const result of results) {
        await client.mutation(api.servers.finishDeviceCommand, { accessKey: identity.accessKey, commandId: result.commandId, error: result.error });
      }
    } catch {
      console.error("Device preview synchronization failed; retrying.");
    }
  }
  try { for (;;) { try { await providerTick(); await simHubTick(); await skillsTick(); await tick(client, identity); await buildsTick(client, identity); } catch { console.error("Worker synchronization failed; retrying."); } await Bun.sleep(1500); } }
  finally { clearInterval(heartbeat); stopDeviceHub(); stopProjectOperations(); stopTerminals(); stopPairing(); setKeepAwake(false); }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Worker startup failed. ${message}`);
  process.exitCode = 1;
});
