/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

test("GitHub connection is stored once on the instance and can be replaced or cleared", async () => {
  const t = convexTest(schema, modules);
  expect(await t.query(api.github.connection)).toBeNull();
  await expect(t.mutation(api.github.save, { login: " ", token: "github_pat_abc" })).rejects.toThrow("Invalid GitHub connection");
  await expect(t.mutation(api.github.save, { login: "octocat", token: "" })).rejects.toThrow("Invalid GitHub connection");
  await t.mutation(api.github.save, { login: " octocat ", token: " github_pat_abc " });
  expect(await t.query(api.github.connection)).toEqual({ login: "octocat", token: "github_pat_abc" });
  await t.mutation(api.github.save, { login: "mona", token: "github_pat_replaced" });
  expect(await t.query(api.github.connection)).toEqual({ login: "mona", token: "github_pat_replaced" });
  expect(await t.run(async ctx => (await ctx.db.query("githubConnection").take(8)).length)).toBe(1);
  await t.mutation(api.github.disconnect);
  expect(await t.query(api.github.connection)).toBeNull();
});
