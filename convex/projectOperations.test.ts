/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
const accessKey = "a".repeat(64);
async function setup() {
  const t = convexTest(schema, modules);
  const serverId = await t.mutation(api.servers.register, {
    accessKey,
    name: "test",
    publicKey: "test",
    projectsRoot: "/tmp",
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
test("commands are scoped to the owning worker, serialized, and cancelled without replay", async () => {
  const { t, projectId } = await setup();
  const id = await t.mutation(api.projectOperations.enqueue, {
    projectId,
    operation: { kind: "terminal", command: "pwd" },
  });
  await expect(
    t.mutation(api.projectOperations.claim, { accessKey: "b".repeat(64) }),
  ).rejects.toThrow();
  expect(
    (await t.mutation(api.projectOperations.claim, { accessKey }))?._id,
  ).toBe(id);
  await t.mutation(api.projectOperations.enqueue, {
    projectId,
    operation: { kind: "status" },
  });
  expect(
    await t.mutation(api.projectOperations.claim, { accessKey }),
  ).toBeNull();
  await t.mutation(api.projectOperations.cancel, { id });
  expect(
    await t.mutation(api.projectOperations.update, {
      id,
      accessKey,
      output: "late result",
      result: { kind: "text", text: "late", exitCode: 0 },
    }),
  ).toBe(false);
  expect(
    (await t.mutation(api.projectOperations.claim, { accessKey }))?.operation
      .kind,
  ).toBe("status");
});
test("status requests coalesce and offline workers reject new work", async () => {
  const { t, projectId, serverId } = await setup();
  const args = { projectId, operation: { kind: "status" as const } };
  expect(await t.mutation(api.projectOperations.enqueue, args)).toBe(
    await t.mutation(api.projectOperations.enqueue, args),
  );
  await t.run((ctx) => ctx.db.patch(serverId, { lastSeen: 0 }));
  await expect(t.mutation(api.projectOperations.enqueue, args)).rejects.toThrow(
    "offline",
  );
});
test("branch switches reject active agents and empty names", async () => {
  const { t, projectId } = await setup();
  await expect(
    t.mutation(api.projectOperations.enqueue, {
      projectId,
      operation: { kind: "checkout", branch: "   " },
    }),
  ).rejects.toThrow("branch name");
  await t.run((ctx) =>
    ctx.db.insert("sessions", {
      projectId,
      title: "test",
      provider: "codex",
      model: "test",
      effort: "medium",
      status: "running",
    }),
  );
  await expect(
    t.mutation(api.projectOperations.enqueue, {
      projectId,
      operation: { kind: "checkout", branch: "main" },
    }),
  ).rejects.toThrow("Stop the agent");
  await expect(
    t.mutation(api.projectOperations.enqueue, {
      projectId,
      operation: { kind: "pull" },
    }),
  ).rejects.toThrow("Stop the agent");
});

test("commits reject active agents and empty selection", async () => {
  const { t, projectId } = await setup();
  await expect(
    t.mutation(api.projectOperations.enqueue, {
      projectId,
      operation: { kind: "commit", message: "test", paths: [] },
    }),
  ).rejects.toThrow("Select files");
  await t.run((ctx) =>
    ctx.db.insert("sessions", {
      projectId,
      title: "test",
      provider: "codex",
      model: "test",
      effort: "medium",
      status: "running",
    }),
  );
  await expect(
    t.mutation(api.projectOperations.enqueue, {
      projectId,
      operation: { kind: "commit", message: "test", paths: ["one"] },
    }),
  ).rejects.toThrow("Stop the agent");
});

test("Git refreshes retain terminal history", async () => {
  const { t, projectId } = await setup();
  const terminalId = await t.mutation(api.projectOperations.enqueue, {
    projectId,
    operation: { kind: "terminal", command: "pwd" },
  });
  await t.mutation(api.projectOperations.claim, { accessKey });
  await t.mutation(api.projectOperations.update, {
    id: terminalId,
    accessKey,
    output: "project",
    result: { kind: "text", text: "project", exitCode: 0 },
  });
  for (let i = 0; i < 55; i++) {
    const id = await t.mutation(api.projectOperations.enqueue, {
      projectId,
      operation: { kind: "status" },
    });
    await t.mutation(api.projectOperations.claim, { accessKey });
    await t.mutation(api.projectOperations.update, {
      id,
      accessKey,
      output: "",
      result: { kind: "status", branch: "main", files: [] },
    });
  }
  const rows = await t.query(api.projectOperations.list, { projectId });
  expect(rows.some((row) => row._id === terminalId)).toBe(true);
  expect(rows.length).toBeLessThan(6);
});
