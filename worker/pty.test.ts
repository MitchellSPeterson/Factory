import { expect, test } from "bun:test";
import os from "node:os";
import {
  appendScrollback,
  attachSocket,
  handleClientFrame,
  parseClientFrame,
  parseServerFrame,
  spawnShell,
  type PtySession,
  type PtySocket,
} from "./pty";

test("parseClientFrame accepts the live PTY wire", () => {
  expect(parseClientFrame(`{"type":"attach","cols":80,"rows":24}`)).toEqual({
    type: "attach",
    cols: 80,
    rows: 24,
  });
  expect(parseClientFrame(`{"type":"write","data":"ls\\n"}`)).toEqual({
    type: "write",
    data: "ls\n",
  });
  expect(parseClientFrame(`{"type":"resize","cols":120,"rows":40}`)?.type).toBe("resize");
  expect(parseClientFrame(`{"type":"clear"}`)).toEqual({ type: "clear" });
  expect(parseClientFrame(`{"type":"close"}`)).toEqual({ type: "close" });
  expect(parseClientFrame(`{"type":"write"}`)).toBeNull();
  expect(parseClientFrame("nope")).toBeNull();
});

test("parseServerFrame accepts ready, replay, data, exit, error, and clear", () => {
  expect(
    parseServerFrame(`{"type":"ready","cwd":"/tmp","cols":80,"rows":24,"status":"running"}`),
  ).toEqual({
    type: "ready",
    cwd: "/tmp",
    cols: 80,
    rows: 24,
    status: "running",
  });
  expect(parseServerFrame(`{"type":"replay","data":"hi"}`)).toEqual({
    type: "replay",
    data: "hi",
  });
  expect(parseServerFrame(`{"type":"data","data":"x"}`)).toEqual({ type: "data", data: "x" });
  expect(parseServerFrame(`{"type":"exit","code":0}`)).toEqual({ type: "exit", code: 0 });
  expect(parseServerFrame(`{"type":"error","message":"boom"}`)).toEqual({
    type: "error",
    message: "boom",
  });
  expect(parseServerFrame(`{"type":"clear"}`)).toEqual({ type: "clear" });
});

function stubSession(writes: string[] = [], resizes: Array<[number, number]> = []): PtySession {
  const sockets = new Set<PtySocket>();
  return {
    proc: {
      terminal: {
        write(data) {
          writes.push(data);
        },
        resize(cols, rows) {
          resizes.push([cols, rows]);
        },
      },
      kill() {},
      exited: Promise.resolve(0),
    },
    scrollback: "hello",
    sockets,
    cwd: "/tmp/project",
    cols: 80,
    rows: 24,
    status: "running",
  };
}

test("reattach replays scrollback then write reaches the PTY", () => {
  const writes: string[] = [];
  const session = stubSession(writes);
  const first: string[] = [];
  const second: string[] = [];
  attachSocket(session, { send: (data) => first.push(data) });
  expect(JSON.parse(first[0]!)).toEqual({
    type: "ready",
    cwd: "/tmp/project",
    cols: 80,
    rows: 24,
    status: "running",
  });
  expect(JSON.parse(first[1]!)).toEqual({ type: "replay", data: "hello" });
  attachSocket(session, { send: (data) => second.push(data) });
  expect(JSON.parse(second[1]!)).toEqual({ type: "replay", data: "hello" });
  handleClientFrame(session, { type: "write", data: "ls\n" });
  expect(writes).toEqual(["ls\n"]);
});

test("clear wipes scrollback and tells attached clients to reset", () => {
  const writes: string[] = [];
  const session = stubSession(writes);
  const frames: string[] = [];
  session.sockets.add({ send: (data) => frames.push(data) });
  handleClientFrame(session, { type: "clear" });
  expect(session.scrollback).toBe("");
  expect(writes).toEqual([]);
  expect(JSON.parse(frames[0]!)).toEqual({ type: "clear" });
});

test("appendScrollback keeps a 256KiB tail", () => {
  expect(appendScrollback("ab", "cd")).toBe("abcd");
  const chunk = "x".repeat(200_000);
  const kept = appendScrollback(chunk, "y".repeat(100_000));
  expect(kept.length).toBe(256 * 1024);
  expect(kept.endsWith("y".repeat(100_000))).toBe(true);
});

test("printf through Bun.spawn terminal appears in PTY output", async () => {
  // Needs a real openpty. Sandboxes that deny ptys should skip.
  const chunks: string[] = [];
  let proc: ReturnType<typeof spawnShell>;
  try {
    proc = spawnShell(os.tmpdir(), 80, 24, (chunk) => {
      chunks.push(chunk);
    });
  } catch (error) {
    console.warn("skip PTY smoke:", error instanceof Error ? error.message : error);
    return;
  }
  try {
    proc.terminal.write("printf factory-pty\\n\n");
    const deadline = Date.now() + 8_000;
    while (!chunks.join("").includes("factory-pty") && Date.now() < deadline) {
      await Bun.sleep(50);
    }
    expect(chunks.join("")).toContain("factory-pty");
  } finally {
    try {
      if (proc.pid) process.kill(-proc.pid, "SIGKILL");
    } catch {
      proc.kill();
    }
  }
});
