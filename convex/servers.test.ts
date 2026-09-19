/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
const key = "a".repeat(64), otherKey = "b".repeat(64), sealed = "x".repeat(200);
async function setup() {
  const t = convexTest(schema, modules);
  const serverId = await t.mutation(api.servers.register, { accessKey: key, publicKey: "public-only", projectsRoot: "/worker/projects", name: "test-worker" });
  await t.mutation(api.servers.register, { accessKey: otherKey, publicKey: "another-public-key", projectsRoot: "/other/projects", name: "other-worker" });
  return { t, serverId };
}
async function add(t: Awaited<ReturnType<typeof setup>>["t"]) {
  return t.mutation(api.servers.importRepository, { accessKey: key, repo: "Owner/Repo", name: "Repo", kind: "web", sealedToken: sealed });
}
test("unpaired callers cannot read or change variables; metadata does not return credentials", async () => {
  const { t } = await setup();
  await expect(t.query(api.servers.paired, { accessKey: "c".repeat(64) })).rejects.toThrow();
  await expect(t.mutation(api.servers.setVariable, { accessKey: "c".repeat(64), scope: "server", name: "OPENAI_API_KEY", sealed })).rejects.toThrow();
  await t.mutation(api.servers.setVariable, { accessKey: key, scope: "server", name: "OPENAI_API_KEY", sealed });
  const paired = await t.query(api.servers.paired, { accessKey: key });
  expect(paired).not.toHaveProperty("accessKey");
  expect(paired.grokCatalog).toBeUndefined();
  await t.mutation(api.servers.reportGrokCatalog, {
    accessKey: key,
    catalog: {
      checkedAt: 1,
      installed: true,
      authenticated: true,
      models: [{ slug: "grok-4.6", name: "Grok 4.6", isDefault: true }],
    },
  });
  expect((await t.query(api.servers.paired, { accessKey: key })).grokCatalog?.models[0]?.slug).toBe("grok-4.6");
  await t.mutation(api.servers.reportProviderUsage, {
    accessKey: key,
    usage: {
      checkedAt: 2,
      meters: [
        { provider: "cursor", status: "ok", checkedAt: 2, remainingCents: 4500, limitCents: 7000, percentUsed: 36 },
        {
          provider: "codex",
          status: "ok",
          checkedAt: 2,
          plan: "Plus",
          percentUsed: 30,
          windows: [{ name: "Session (5h)", percentUsed: 30, windowSeconds: 18000, resetsAt: 3 }],
        },
      ],
    },
  });
  const usage = (await t.query(api.servers.paired, { accessKey: key })).providerUsage;
  expect(usage?.meters[0]).toMatchObject({ provider: "cursor", remainingCents: 4500 });
  await expect(t.mutation(api.servers.reportProviderUsage, { accessKey: "c".repeat(64), usage: { checkedAt: 3, meters: [] } })).rejects.toThrow();
  const rows = await t.query(api.servers.variables, { accessKey: key, scope: "server" });
  expect(rows).toHaveLength(1); expect(rows[0]).not.toHaveProperty("sealed");
  expect(await t.query(api.servers.readEnvironment, { accessKey: otherKey })).toEqual([]);
});
test("environment values are scoped to the paired worker and can be replaced or removed", async () => {
  const { t } = await setup(); const projectId = await add(t);
  await t.mutation(api.servers.setVariable, { accessKey: key, scope: projectId, name: "DATABASE_URL", sealed });
  await expect(t.query(api.servers.readEnvironment, { accessKey: otherKey, projectId })).rejects.toThrow();
  await expect(t.mutation(api.servers.setVariable, { accessKey: otherKey, scope: projectId, name: "DATABASE_URL", sealed })).rejects.toThrow();
  await expect(t.mutation(api.servers.removeVariable, { accessKey: otherKey, scope: projectId, name: "DATABASE_URL" })).rejects.toThrow();
  await t.mutation(api.servers.setVariable, { accessKey: key, scope: projectId, name: "DATABASE_URL", sealed: "y".repeat(200) });
  expect(await t.query(api.servers.readEnvironment, { accessKey: key, projectId })).toEqual([{ name: "DATABASE_URL", scope: projectId, sealed: "y".repeat(200) }]);
  await t.mutation(api.servers.removeVariable, { accessKey: key, scope: projectId, name: "DATABASE_URL" });
  expect(await t.query(api.servers.readEnvironment, { accessKey: key, projectId })).toEqual([]);
});
test("imports deduplicate repositories and readiness blocks Sessions", async () => {
  const { t } = await setup(); const id = await add(t);
  await expect(add(t)).rejects.toThrow("already a Project");
  await expect(t.mutation(api.sessions.create, { projectId: id, accessKey: key, provider: "codex", model: "gpt-5.6-terra", effort: "medium", text: "hello" })).rejects.toThrow("finish cloning");
  expect(await t.mutation(api.servers.claimImport, { accessKey: otherKey })).toBeNull();
  const task = await t.mutation(api.servers.claimImport, { accessKey: key });
  expect(task?.status).toBe("cloning");
  expect(await t.mutation(api.servers.claimImport, { accessKey: key })).toBeNull();
  await expect(t.mutation(api.servers.finishImport, { accessKey: otherKey, importId: task!._id, attempt: task!.attempt, localPath: "/elsewhere" })).rejects.toThrow();
  await t.mutation(api.servers.finishImport, { accessKey: key, importId: task!._id, attempt: task!.attempt, localPath: "/worker/projects/repo" });
  expect((await t.query(api.projects.get, { projectId: id }))?.cloneStatus).toBe("ready");
  expect(await t.run(ctx => ctx.db.get(task!._id))).not.toHaveProperty("sealedToken");
});
test("failed clones can be retried with new credentials and stale completions are ignored", async () => {
  const { t } = await setup(); const projectId = await add(t);
  const first = (await t.mutation(api.servers.claimImport, { accessKey: key }))!;
  await t.mutation(api.servers.finishImport, { accessKey: key, importId: first._id, attempt: first.attempt, error: "Network unavailable" });
  await t.mutation(api.servers.retryImport, { accessKey: key, projectId, sealedToken: sealed });
  const second = (await t.mutation(api.servers.claimImport, { accessKey: key }))!;
  expect(second.attempt).toBe(first.attempt + 1);
  await t.mutation(api.servers.finishImport, { accessKey: key, importId: first._id, attempt: first.attempt, localPath: "/stale" });
  expect((await t.query(api.projects.get, { projectId }))?.cloneStatus).toBe("cloning");
});
test("reserved environment names and repository path escapes are rejected", async () => {
  const { t } = await setup(); const projectId = await add(t);
  await expect(t.mutation(api.servers.setVariable, { accessKey: key, scope: projectId, name: "BASH_ENV", sealed })).rejects.toThrow("reserved");
  await expect(t.mutation(api.servers.setVariable, { accessKey: key, scope: "server", name: "CONVEX_URL", sealed })).rejects.toThrow();
  await expect(t.mutation(api.servers.importRepository, { accessKey: key, repo: "../escape", name: "bad", kind: "web", sealedToken: sealed })).rejects.toThrow();
});
test("managed Projects cannot be modified or removed by another worker", async () => {
  const { t } = await setup(); const projectId = await add(t);
  await expect(t.mutation(api.projects.remove, { projectId, accessKey: otherKey })).rejects.toThrow();
  await expect(t.mutation(api.projects.update, { projectId, accessKey: key, name: "Repo", localPath: "/escape", githubRepo: "owner/repo", kind: "web", defaultRuntime: "local" })).rejects.toThrow("cannot be changed");
});
test("sim hub state and Device commands stay on the paired worker", async () => {
  const { t } = await setup();
  expect((await t.query(api.servers.paired, { accessKey: key })).simHub).toBeUndefined();
  await t.mutation(api.servers.setSimHubWanted, { accessKey: key, wanted: true });
  await expect(t.mutation(api.servers.setSimHubWanted, { accessKey: "c".repeat(64), wanted: true })).rejects.toThrow();
  expect((await t.query(api.servers.paired, { accessKey: key })).simHubWanted).toBe(true);
  await t.mutation(api.servers.reportSimHub, {
    accessKey: key,
    hub: {
      checkedAt: 1,
      supported: true,
      running: true,
      devices: [{ udid: "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE", name: "iPhone 16 Pro", state: "booted", streamUrl: "http://127.0.0.1:3100/stream.mjpeg" }],
    },
  });
  expect((await t.query(api.servers.paired, { accessKey: key })).simHub?.devices[0]?.name).toBe("iPhone 16 Pro");
  const first = await t.mutation(api.servers.enqueueDeviceCommand, { accessKey: key, command: { kind: "boot", udid: "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" } });
  const again = await t.mutation(api.servers.enqueueDeviceCommand, { accessKey: key, command: { kind: "boot", udid: "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" } });
  expect(again).toBe(first);
  await t.mutation(api.servers.enqueueDeviceCommand, { accessKey: otherKey, command: { kind: "boot", udid: "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" } });
  expect((await t.mutation(api.servers.claimDeviceCommands, { accessKey: otherKey })).commands).toHaveLength(1);
  const claimed = await t.mutation(api.servers.claimDeviceCommands, { accessKey: key });
  expect(claimed.wanted).toBe(true);
  expect(claimed.commands).toEqual([{ commandId: first, command: { kind: "boot", udid: "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" } }]);
  expect((await t.mutation(api.servers.claimDeviceCommands, { accessKey: key })).commands).toEqual([]);
  await t.mutation(api.servers.finishDeviceCommand, { accessKey: key, commandId: first });
  expect((await t.mutation(api.servers.claimDeviceCommands, { accessKey: key })).commands).toEqual([]);
});
test("the UI uses this machine without a pairing key", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.servers.local)).toBeNull();
  await t.mutation(api.servers.register, { accessKey: key, publicKey: "public-only", projectsRoot: "/worker/projects", name: "test-worker" });
  const local = await t.query(api.servers.local);
  expect(local?.name).toBe("test-worker");
  expect(local).not.toHaveProperty("accessKey");
  await t.mutation(api.servers.setSimHubWanted, { wanted: true });
  expect((await t.query(api.servers.local))?.simHubWanted).toBe(true);
  const commandId = await t.mutation(api.servers.enqueueDeviceCommand, { command: { kind: "boot", udid: "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" } });
  expect(commandId.length).toBeGreaterThan(0);
  const claimed = await t.mutation(api.servers.claimDeviceCommands, { accessKey: key });
  expect(claimed.wanted).toBe(true);
  expect(claimed.commands).toEqual([{ commandId, command: { kind: "boot", udid: "AAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" } }]);
});
test("worker startup accepts the Skill source metadata produced by the loader", async () => {
  const { t } = await setup();
  const result = await t.mutation(api.seed.ensure, { skills: ["factory-plan", "domain-modeling", "grilling", "poteto-feature", "verify", "opening-pr"].map(slug => ({ slug, title: slug, body: "test", sourceHint: "factory", sourceKind: "factory" as const })) });
  expect(result.createdSkills).toBe(6);
});
