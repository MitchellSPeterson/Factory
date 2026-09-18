/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const key = "a".repeat(64);

test("the worker reports repo Skills onto a Project", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.servers.register, {
    accessKey: key,
    publicKey: "public-only",
    projectsRoot: "/worker/projects",
    name: "test-worker",
  });
  const projectId = await t.run(async (ctx) => {
    return await ctx.db.insert("projects", {
      name: "Factory",
      kind: "web",
      localPath: "/tmp/factory",
      githubRepo: "owner/repo",
      defaultRuntime: "local",
    });
  });
  await t.mutation(api.projects.reportSkills, {
    accessKey: key,
    projectId,
    skills: [
      {
        slug: "adapt",
        title: "Adapt",
        description: "Adapt designs across screens.",
        relPath: ".agents/skills/adapt/SKILL.md",
      },
    ],
  });
  const project = await t.query(api.projects.get, { projectId });
  expect(project?.skills).toEqual([
    {
      slug: "adapt",
      title: "Adapt",
      description: "Adapt designs across screens.",
      relPath: ".agents/skills/adapt/SKILL.md",
    },
  ]);
});
