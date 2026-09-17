/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const accessKey = "a".repeat(64);
const otherKey = "b".repeat(64);

async function setup() {
  const t = convexTest(schema, modules);
  const serverId = await t.mutation(api.servers.register, {
    accessKey,
    name: "test",
    publicKey: "test",
    projectsRoot: "/tmp",
  });
  await t.mutation(api.servers.register, {
    accessKey: otherKey,
    name: "other",
    publicKey: "other",
    projectsRoot: "/other",
  });
  const projectId = await t.run((ctx) =>
    ctx.db.insert("projects", {
      name: "test",
      kind: "web",
      localPath: "/tmp/test",
      githubRepo: "",
      defaultRuntime: "local",
      serverId,
    }),
  );
  return { t, projectId, serverId };
}

test("issueTicket requires an online worker with an advertised PTY", async () => {
  const { t, projectId, serverId } = await setup();
  await expect(
    t.mutation(api.pty.issueTicket, { projectId }),
  ).rejects.toThrow("not available");
  await t.mutation(api.pty.reportPty, {
    accessKey,
    url: "ws://127.0.0.1:3401/pty",
  });
  const issued = await t.mutation(api.pty.issueTicket, { projectId });
  expect(issued.wsUrl).toBe("ws://127.0.0.1:3401/pty");
  expect(issued.ticket).toHaveLength(64);
  expect(issued.expiresAt).toBeGreaterThan(Date.now());
  expect(issued.hostOs).toBeUndefined();
  await t.run((ctx) => ctx.db.patch(serverId, { lastSeen: 0 }));
  await expect(
    t.mutation(api.pty.issueTicket, { projectId }),
  ).rejects.toThrow("offline");
});

test("issueTicket returns the worker OS advertised with the PTY", async () => {
  const { t, projectId } = await setup();
  await t.mutation(api.pty.reportPty, {
    accessKey,
    url: "ws://127.0.0.1:3401/pty",
    os: "darwin",
  });
  const issued = await t.mutation(api.pty.issueTicket, { projectId });
  expect(issued.hostOs).toBe("darwin");
});

test("validateTicket is reusable until expiry and bound to the issuing worker", async () => {
  const { t, projectId } = await setup();
  await t.mutation(api.pty.reportPty, {
    accessKey,
    url: "ws://127.0.0.1:3401/pty",
  });
  const { ticket } = await t.mutation(api.pty.issueTicket, { projectId });
  const first = await t.mutation(api.pty.validateTicket, { accessKey, ticket });
  expect(first).toEqual({ projectId, cwd: "/tmp/test" });
  expect(await t.mutation(api.pty.validateTicket, { accessKey, ticket })).toEqual(
    first,
  );
  await expect(
    t.mutation(api.pty.validateTicket, { accessKey: otherKey, ticket }),
  ).rejects.toThrow("Invalid ticket");
  await t.run(async (ctx) => {
    const row = await ctx.db
      .query("ptyTickets")
      .withIndex("by_token", (q) => q.eq("token", ticket))
      .unique();
    await ctx.db.patch(row!._id, { expiresAt: 1 });
  });
  await expect(
    t.mutation(api.pty.validateTicket, { accessKey, ticket }),
  ).rejects.toThrow("expired");
});
