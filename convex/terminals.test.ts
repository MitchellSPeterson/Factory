/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
const modules = import.meta.glob("./**/*.ts");
const accessKey = "a".repeat(64);
const auth = { accessKey, owner: "worker-one" };
async function setup() {
  const t = convexTest(schema, modules);
  const serverId = await t.mutation(api.servers.register, {
    accessKey,
    name: "test",
    publicKey: "test",
    projectsRoot: "/tmp",
  });
  const project = {
    kind: "web",
    localPath: "/tmp",
    githubRepo: "",
    defaultRuntime: "local",
    serverId,
  } satisfies {
    kind: "web";
    localPath: string;
    githubRepo: string;
    defaultRuntime: "local";
    serverId: typeof serverId;
  };
  const first = await t.run((ctx) =>
    ctx.db.insert("projects", { ...project, name: "first" }),
  );
  const second = await t.run((ctx) =>
    ctx.db.insert("projects", { ...project, name: "second" }),
  );
  return { t, first, second, serverId };
}
test("tabs persist per project; worker claims recover without stealing and output retries are idempotent", async () => {
  const { t, first, second } = await setup();
  const id = await t.mutation(api.terminals.create, { projectId: first });
  const other = await t.mutation(api.terminals.create, { projectId: second });
  expect(
    (await t.query(api.terminals.list, { projectId: first })).map((t) => t._id),
  ).toEqual([id]);
  expect((await t.mutation(api.terminals.claim, auth)).length).toBe(2);
  expect((await t.mutation(api.terminals.claim, auth)).length).toBe(2);
  expect(
    await t.mutation(api.terminals.claim, { ...auth, owner: "other-process" }),
  ).toEqual([]);
  const exchange = { ...auth, id, inputAck: 0, output: "hello", outputEnd: 5 };
  await t.mutation(api.terminals.exchange, exchange);
  await t.mutation(api.terminals.exchange, exchange);
  expect(await t.query(api.terminals.output, { id })).toEqual({
    output: "hello",
    outputEnd: 5,
  });
  await t.mutation(api.terminals.input, { id, data: "pwd\r" });
  expect(await t.mutation(api.terminals.exchange, exchange)).toMatchObject({
    input: "pwd\r",
    inputEnd: 4,
  });
  await t.mutation(api.terminals.input, { id, data: "ls\r" });
  expect(
    await t.mutation(api.terminals.exchange, { ...exchange, inputAck: 4 }),
  ).toMatchObject({ input: "ls\r", inputEnd: 7 });
  expect(
    await t.mutation(api.terminals.exchange, { ...exchange, inputAck: 7 }),
  ).toMatchObject({ input: "", inputEnd: 7 });
  await t.mutation(api.terminals.close, { id });
  expect(await t.mutation(api.terminals.exchange, exchange)).toBeNull();
  expect(await t.query(api.terminals.output, { id })).toBeNull();
  expect(
    (await t.query(api.terminals.list, { projectId: second }))[0]._id,
  ).toBe(other);
});
test("expired shells retain output and reject input; wrong workers cannot read terminal input", async () => {
  const { t, first } = await setup();
  const id = await t.mutation(api.terminals.create, { projectId: first });
  await t.mutation(api.terminals.claim, auth);
  const exchange = { ...auth, id, inputAck: 0, output: "saved", outputEnd: 5 };
  await t.mutation(api.terminals.exchange, exchange);
  await t.mutation(api.servers.register, {
    accessKey: "b".repeat(64),
    name: "other",
    publicKey: "test",
    projectsRoot: "/tmp",
  });
  expect(
    await t.mutation(api.terminals.exchange, {
      ...exchange,
      accessKey: "b".repeat(64),
    }),
  ).toBeNull();
  await t.run((ctx) => ctx.db.patch(id, { leaseUntil: 0 }));
  await expect(
    t.mutation(api.terminals.input, { id, data: "unsafe\r" }),
  ).rejects.toThrow("disconnected");
  expect(await t.mutation(api.terminals.claim, auth)).toEqual([]);
  expect(
    (await t.query(api.terminals.list, { projectId: first }))[0].state,
  ).toBe("exited");
  expect(await t.query(api.terminals.output, { id })).toEqual({
    output: "saved",
    outputEnd: 5,
  });
});
test("offline creation, invalid sizes, and oversized input are rejected", async () => {
  const { t, first, serverId } = await setup();
  const id = await t.mutation(api.terminals.create, { projectId: first });
  await t.mutation(api.terminals.claim, auth);
  await expect(
    t.mutation(api.terminals.input, { id, data: "x".repeat(16385) }),
  ).rejects.toThrow("full");
  await expect(
    t.mutation(api.terminals.resize, { id, cols: 0, rows: 24 }),
  ).rejects.toThrow("size");
  await t.run((ctx) => ctx.db.patch(serverId, { lastSeen: 0 }));
  await expect(
    t.mutation(api.terminals.create, { projectId: first }),
  ).rejects.toThrow("offline");
});
