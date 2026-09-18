/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { titleFrom } from "./sessions";

const modules = import.meta.glob("./**/*.ts");

async function setup() {
  const t = convexTest(schema, modules);
  const projectId = await t.run(async (ctx) => {
    return await ctx.db.insert("projects", {
      name: "Factory",
      kind: "web",
      localPath: "/tmp/factory",
      githubRepo: "owner/repo",
      defaultRuntime: "local",
    });
  });
  return { t, projectId };
}

test("titleFrom keeps short prompts and trims long ones", () => {
  expect(titleFrom("  Fix auth  ")).toBe("Fix auth");
  expect(titleFrom("")).toBe("New session");
  expect(titleFrom("", 1)).toBe("Image");
  expect(titleFrom("x".repeat(80)).length).toBe(72);
});

test("creating a Session queues the first message without a Job or Workflow", async () => {
  const { t, projectId } = await setup();
  const sessionId = await t.mutation(api.sessions.create, {
    projectId,
    provider: "grok",
    model: "grok-4.6",
    effort: "medium",
    text: "How does auth work?",
  });
  const listed = await t.query(api.sessions.list, {});
  expect(listed).toHaveLength(1);
  expect(listed[0]?.session.status).toBe("queued");
  expect(listed[0]?.session.title).toBe("How does auth work?");
  expect(listed[0]?.projectName).toBe("Factory");
  const view = await t.query(api.sessions.get, { sessionId });
  expect(view?.messages.map((message) => message.role)).toEqual(["user"]);
  expect(view?.messages[0]?.text).toBe("How does auth work?");
});

test("the worker claims a Session, streams a reply, and returns it to idle", async () => {
  const { t, projectId } = await setup();
  const sessionId = await t.mutation(api.sessions.create, {
    projectId,
    provider: "codex",
    model: "gpt-5.6-terra",
    effort: "low",
    text: "Explain the board",
  });
  const queued = await t.query(api.sessions.listQueued, {});
  expect(queued).toEqual([sessionId]);
  const launch = await t.mutation(api.sessions.claim, { sessionId });
  expect(launch?.prompt).toBe("Explain the board");
  expect(launch?.provider).toBe("codex");
  expect(launch?.images).toEqual([]);
  expect(await t.query(api.sessions.getStatus, { sessionId })).toBe("running");
  await t.mutation(api.sessions.bindAgent, { sessionId, agentId: "thread-1" });
  await t.mutation(api.sessions.appendMessage, { sessionId, text: "Hello" });
  await t.mutation(api.sessions.appendMessage, { sessionId, text: " world" });
  await t.mutation(api.sessions.recordUsage, {
    sessionId,
    usage: {
      inputTokens: 10,
      outputTokens: 4,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalTokens: 14,
    },
  });
  await t.mutation(api.sessions.complete, { sessionId });
  const view = await t.query(api.sessions.get, { sessionId });
  expect(view?.session.status).toBe("idle");
  expect(view?.session.agentId).toBe("thread-1");
  expect(view?.messages.map((message) => message.text)).toEqual(["Explain the board", "Hello world"]);
  expect(launch?.permissionMode).toBe("supervised");
  expect(view?.messages[0]?.imageUrls).toEqual([]);
  expect(view?.session.usage?.totalTokens).toBe(14);
});

test("configure can change provider on an idle Session and drops the stored thread", async () => {
  const { t, projectId } = await setup();
  const sessionId = await t.mutation(api.sessions.create, {
    projectId,
    provider: "grok",
    model: "grok-4.6",
    effort: "medium",
    text: "Hi",
  });
  await t.mutation(api.sessions.claim, { sessionId });
  await t.mutation(api.sessions.bindAgent, { sessionId, agentId: "grok-abc" });
  await t.mutation(api.sessions.complete, { sessionId });
  await t.mutation(api.sessions.configure, {
    sessionId,
    provider: "codex",
    model: "gpt-5.6-terra",
    effort: "high",
  });
  const view = await t.query(api.sessions.get, { sessionId });
  expect(view?.session.provider).toBe("codex");
  expect(view?.session.model).toBe("gpt-5.6-terra");
  expect(view?.session.effort).toBe("high");
  expect(view?.session.agentId).toBeUndefined();
});

test("creating a Session with Cursor stores that provider", async () => {
  const { t, projectId } = await setup();
  const sessionId = await t.mutation(api.sessions.create, {
    projectId,
    provider: "cursor",
    model: "composer-2.5",
    effort: "medium",
    text: "What should I change?",
  });
  const view = await t.query(api.sessions.get, { sessionId });
  expect(view?.session.provider).toBe("cursor");
  expect(view?.session.model).toBe("composer-2.5");
});

test("follow-up messages wait until the current turn is idle", async () => {
  const { t, projectId } = await setup();
  const sessionId = await t.mutation(api.sessions.create, {
    projectId,
    provider: "grok",
    model: "grok-4.6",
    effort: "medium",
    text: "First",
  });
  await t.mutation(api.sessions.claim, { sessionId });
  await expect(t.mutation(api.sessions.send, { sessionId, text: "Second" })).rejects.toThrow(
    "Wait for the current turn to finish.",
  );
  await t.mutation(api.sessions.complete, { sessionId });
  await t.mutation(api.sessions.send, { sessionId, text: "Second" });
  expect(await t.query(api.sessions.getStatus, { sessionId })).toBe("queued");
});

test("stopping a Session is not a Job failure and can be continued", async () => {
  const { t, projectId } = await setup();
  const sessionId = await t.mutation(api.sessions.create, {
    projectId,
    provider: "grok",
    model: "grok-4.6",
    effort: "high",
    text: "Start",
  });
  await t.mutation(api.sessions.claim, { sessionId });
  await t.mutation(api.sessions.stop, { sessionId });
  expect(await t.query(api.sessions.getStatus, { sessionId })).toBe("stopped");
  await t.mutation(api.sessions.fail, { sessionId, error: "ignored after stop" });
  expect(await t.query(api.sessions.getStatus, { sessionId })).toBe("stopped");
  await t.mutation(api.sessions.send, { sessionId, text: "Continue" });
  expect(await t.query(api.sessions.getStatus, { sessionId })).toBe("queued");
});

test("removing a Session deletes its transcript", async () => {
  const { t, projectId } = await setup();
  const sessionId = await t.mutation(api.sessions.create, {
    projectId,
    provider: "codex",
    model: "gpt-5.6-terra",
    effort: "medium",
    text: "Bye",
  });
  await t.mutation(api.sessions.remove, { sessionId });
  expect(await t.query(api.sessions.get, { sessionId })).toBeNull();
  expect(await t.query(api.sessions.list, {})).toEqual([]);
});

test("structured Grok items stay separate from the assistant log", async () => {
  const { t, projectId } = await setup();
  const sessionId = await t.mutation(api.sessions.create, {
    projectId,
    provider: "grok",
    model: "grok-4.6",
    effort: "medium",
    permissionMode: "supervised",
    text: "Edit auth",
  });
  await t.mutation(api.sessions.claim, { sessionId });
  await t.mutation(api.sessions.appendMessage, { sessionId, text: "Looking." });
  await t.mutation(api.sessions.upsertItem, {
    sessionId,
    itemId: "call_1",
    kind: "tool",
    title: "Read file",
    status: "inProgress",
    text: "auth.ts",
  });
  await t.mutation(api.sessions.appendMessage, { sessionId, text: "Done." });
  await t.mutation(api.sessions.upsertItem, {
    sessionId,
    itemId: "call_1",
    kind: "permission",
    title: "Run command",
    status: "pending",
    requestId: "5",
    options: [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "reject-once", name: "Reject", kind: "reject_once" },
    ],
  });
  await t.mutation(api.sessions.resolvePermission, { sessionId, requestId: "5", optionId: "allow-once" });
  const view = await t.query(api.sessions.get, { sessionId });
  expect(view?.messages.map((message) => message.kind ?? "message")).toEqual([
    "message",
    "message",
    "tool",
    "message",
    "permission",
  ]);
  expect(view?.messages.map((message) => message.text)).toEqual([
    "Edit auth",
    "Looking.",
    "auth.ts",
    "Done.",
    "",
  ]);
  expect(await t.query(api.sessions.getPermission, { sessionId, requestId: "5" })).toEqual({
    status: "resolved",
    optionId: "allow-once",
  });
});

test("a blank message is rejected", async () => {
  const { t, projectId } = await setup();
  await expect(
    t.mutation(api.sessions.create, {
      projectId,
      provider: "grok",
      model: "grok-4.6",
      effort: "medium",
      text: "   ",
    }),
  ).rejects.toThrow("Message is required");
  const sessionId = await t.mutation(api.sessions.create, {
    projectId,
    provider: "grok",
    model: "grok-4.6",
    effort: "medium",
    text: "Hi",
  });
  await t.mutation(api.sessions.claim, { sessionId });
  await t.mutation(api.sessions.complete, { sessionId });
  await expect(t.mutation(api.sessions.send, { sessionId, text: "" })).rejects.toThrow("Message is required");
});

async function requestApproval(
  t: Awaited<ReturnType<typeof setup>>["t"],
  sessionId: Id<"sessions">,
  requestId = "5",
) {
  await t.mutation(api.sessions.upsertItem, {
    sessionId,
    itemId: "call_1",
    kind: "permission",
    title: "Edit file",
    status: "pending",
    requestId,
    options: [
      { optionId: "allow-once", name: "Yes", kind: "allow_once" },
      { optionId: "reject-once", name: "No", kind: "reject_once" },
    ],
  });
}

test("ending a turn drops leftover approvals so a follow-up does not throw", async () => {
  const { t, projectId } = await setup();
  const sessionId = await t.mutation(api.sessions.create, {
    projectId,
    provider: "grok",
    model: "grok-4.6",
    effort: "medium",
    permissionMode: "supervised",
    text: "Edit the sidebar",
  });
  await t.mutation(api.sessions.claim, { sessionId });
  await requestApproval(t, sessionId);
  await t.mutation(api.sessions.complete, { sessionId });
  const view = await t.query(api.sessions.get, { sessionId });
  const permission = view?.messages.find((message) => message.kind === "permission");
  expect(permission?.status).toBe("failed");
  expect(await t.query(api.sessions.getPermission, { sessionId, requestId: "5" })).toEqual({
    status: "denied",
  });
  await expect(
    t.mutation(api.sessions.resolvePermission, {
      sessionId,
      requestId: "5",
      optionId: "allow-once",
    }),
  ).resolves.toBeNull();
  await t.mutation(api.sessions.send, { sessionId, text: "Try again" });
  expect(await t.query(api.sessions.getStatus, { sessionId })).toBe("queued");
  const followUp = await t.query(api.sessions.get, { sessionId });
  expect(followUp?.messages.some((message) => message.status === "pending")).toBe(false);
});

test("a follow-up expires leftover approvals from an earlier turn", async () => {
  const { t, projectId } = await setup();
  const sessionId = await t.mutation(api.sessions.create, {
    projectId,
    provider: "grok",
    model: "grok-4.6",
    effort: "medium",
    text: "Edit the sidebar",
  });
  await t.mutation(api.sessions.claim, { sessionId });
  await t.mutation(api.sessions.complete, { sessionId });
  await requestApproval(t, sessionId);
  expect(await t.query(api.sessions.getPermission, { sessionId, requestId: "5" })).toEqual({
    status: "pending",
  });
  await t.mutation(api.sessions.send, { sessionId, text: "Continue" });
  expect(await t.query(api.sessions.getPermission, { sessionId, requestId: "5" })).toEqual({
    status: "denied",
  });
});

test("stopping a Session expires a pending approval", async () => {
  const { t, projectId } = await setup();
  const sessionId = await t.mutation(api.sessions.create, {
    projectId,
    provider: "grok",
    model: "grok-4.6",
    effort: "medium",
    text: "Edit the sidebar",
  });
  await t.mutation(api.sessions.claim, { sessionId });
  await requestApproval(t, sessionId);
  await t.mutation(api.sessions.stop, { sessionId });
  const view = await t.query(api.sessions.get, { sessionId });
  expect(view?.messages.find((message) => message.kind === "permission")?.status).toBe("failed");
});
