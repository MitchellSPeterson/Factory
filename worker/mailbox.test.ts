import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { api } from "../shared/mailboxApi";
import { compactSessionPrompt, isCompactCommand, titleFrom } from "./mailbox/functions";
import { mailboxForFile, type Mailbox } from "./mailbox/client";

const temps: string[] = [];
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function mailbox(): Mailbox {
  const dir = mkdtempSync(path.join(os.tmpdir(), "factory-mailbox-"));
  temps.push(dir);
  return mailboxForFile(path.join(dir, "mailbox.sqlite"));
}

const key = "a".repeat(64);
const otherKey = "b".repeat(64);
const sealed = "x".repeat(200);

async function register(client: Mailbox, accessKey = key) {
  return client.mutation(api.servers.register, {
    accessKey,
    publicKey: accessKey === key ? "public-only" : "another-public-key",
    projectsRoot: accessKey === key ? "/worker/projects" : "/other/projects",
    name: accessKey === key ? "test-worker" : "other-worker",
  });
}

test("titleFrom keeps short prompts and trims long ones", () => {
  expect(titleFrom("  Fix auth  ")).toBe("Fix auth");
  expect(titleFrom("")).toBe("New session");
  expect(titleFrom("", 1)).toBe("Image");
  expect(titleFrom("", 0, "Grilling")).toBe("Grilling");
  expect(titleFrom("x".repeat(80)).length).toBe(72);
});

test("compact helpers", () => {
  expect(isCompactCommand("/compact")).toBe(true);
  expect(compactSessionPrompt("/compact extra")).toContain("extra");
});

test("creating a Session queues the first message", async () => {
  const client = mailbox();
  const projectId = await client.mutation(api.projects.create, {
    name: "Factory",
    kind: "web",
    localPath: "/tmp/factory",
    githubRepo: "owner/repo",
    defaultRuntime: "local",
  });
  const sessionId = await client.mutation(api.sessions.create, {
    projectId,
    provider: "grok",
    model: "grok-4.6",
    effort: "medium",
    text: "How does auth work?",
  });
  const listed = await client.query(api.sessions.list, {});
  expect(listed).toHaveLength(1);
  expect(listed[0]?.session.status).toBe("queued");
  expect(listed[0]?.session.title).toBe("How does auth work?");
  const view = await client.query(api.sessions.get, { sessionId });
  expect(view?.messages.map((message: { role: string }) => message.role)).toEqual(["user"]);
});

test("worker register, local view, and import isolation", async () => {
  const client = mailbox();
  expect(await client.query(api.servers.local, {})).toBeNull();
  await register(client);
  await register(client, otherKey);
  const first = await client.query(api.servers.paired, { accessKey: key });
  const second = await client.query(api.servers.paired, { accessKey: otherKey });
  const local = await client.query(api.servers.local, {});
  expect(first.name).toBe("test-worker");
  expect(second.name).toBe("other-worker");
  expect(local?.name === "test-worker" || local?.name === "other-worker").toBe(true);
  await client.mutation(api.servers.setVariable, {
    accessKey: key,
    scope: "server",
    name: "OPENAI_API_KEY",
    sealed,
  });
  const env = await client.query(api.servers.readEnvironment, { accessKey: key });
  expect(env).toEqual([{ name: "OPENAI_API_KEY", sealed, scope: "server" }]);
  expect(await client.query(api.servers.readEnvironment, { accessKey: otherKey })).toEqual([]);
});

test("import claim and finish", async () => {
  const client = mailbox();
  await register(client);
  await register(client, otherKey);
  const id = await client.mutation(api.servers.importRepository, {
    accessKey: key,
    repo: "Owner/Repo",
    name: "Repo",
    kind: "web",
    sealedToken: sealed,
  });
  await expect(
    client.mutation(api.sessions.create, {
      projectId: id,
      accessKey: key,
      provider: "codex",
      model: "gpt-5.6-terra",
      effort: "medium",
      text: "hello",
    }),
  ).rejects.toThrow("finish cloning");
  expect(await client.mutation(api.servers.claimImport, { accessKey: otherKey })).toBeNull();
  const task = await client.mutation(api.servers.claimImport, { accessKey: key });
  expect(task?.projectId).toBe(id);
  await client.mutation(api.servers.finishImport, {
    accessKey: key,
    importId: task!._id,
    attempt: task!.attempt,
    localPath: "/worker/projects/repo",
  });
  expect((await client.query(api.projects.get, { projectId: id }))?.cloneStatus).toBe("ready");
});

test("project operations enqueue, claim, and cancel", async () => {
  const client = mailbox();
  await register(client);
  const projectId = await client.mutation(api.projects.create, {
    name: "App",
    kind: "web",
    localPath: "/tmp/app",
    githubRepo: "",
    defaultRuntime: "local",
  });
  const id = await client.mutation(api.projectOperations.enqueue, {
    projectId,
    operation: { kind: "status" },
  });
  expect(await client.mutation(api.projectOperations.enqueue, { projectId, operation: { kind: "status" } })).toBe(id);
  expect((await client.mutation(api.projectOperations.claim, { accessKey: key }))?._id).toBe(id);
  await client.mutation(api.projectOperations.update, {
    accessKey: key,
    id,
    output: "ok",
    result: { kind: "text", text: "ok", exitCode: 0 },
  });
  const rows = await client.query(api.projectOperations.list, { projectId });
  expect(rows[0]?.state).toBe("done");
});

test("seed skills and github connection", async () => {
  const client = mailbox();
  const result = await client.mutation(api.seed.ensure, {
    skills: [{ slug: "adapt", title: "Adapt", body: "test", sourceHint: "factory", sourceKind: "factory" }],
  });
  expect(result.createdSkills).toBe(1);
  expect(await client.query(api.seed.featureReady, {})).toBe(true);
  await client.mutation(api.github.save, { login: "octocat", token: "gho_test" });
  expect(await client.query(api.github.connection, {})).toEqual({ login: "octocat", token: "gho_test" });
  await client.mutation(api.github.disconnect, {});
  expect(await client.query(api.github.connection, {})).toBeNull();
});
