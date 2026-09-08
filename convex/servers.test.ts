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
test("imports deduplicate repositories and readiness blocks Jobs", async () => {
  const { t } = await setup(); const id = await add(t);
  await expect(add(t)).rejects.toThrow("already a Project");
  await expect(t.mutation(api.jobs.create, { projectId: id, accessKey: key, request: "test", runtime: "local", forceGrill: false })).rejects.toThrow("finish cloning");
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
test("worker startup accepts the Skill source metadata produced by the loader", async () => {
  const { t } = await setup();
  const result = await t.mutation(api.seed.ensure, { skills: ["factory-plan", "domain-modeling", "grilling", "poteto-feature", "verify", "opening-pr"].map(slug => ({ slug, title: slug, body: "test", sourceHint: "factory", sourceKind: "factory" as const })) });
  expect(result.createdSkills).toBe(6);
});
