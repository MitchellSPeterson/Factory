import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Mailbox } from "./mailbox/client";
import { startSessionBridge } from "./sessionBridge";
import { inspectionSandboxArgs, sessionExecutionEnvironment, workflowExecutionProtection } from "./buildWorkflow";

test("Session reporting capability cannot launch work, change Builds, or report another Session", async () => {
  const calls: string[] = [];
  const client = { url: "local", query: async (ref: string) => { calls.push(ref); return "running"; }, mutation: async (ref: string) => { calls.push(ref); return null; }, action: async () => { throw new Error("forbidden"); } } as Mailbox;
  const bridge = startSessionBridge(client, "own-session");
  const send = (kind: string, path: string, sessionId = "own-session", token = bridge.token) => fetch(`${bridge.workerUrl}/api/${kind}`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify({ path, args: { sessionId, text: "report" } }) });
  try {
    expect((await send("mutation", "sessions.appendMessage")).status).toBe(200);
    expect((await send("query", "sessions.getStatus")).status).toBe(200);
    for (const path of ["sessions.create", "builds.action", "builds.updateWorkflow", "servers.readEnvironment", "sessions.resolvePermission"]) expect((await send("mutation", path)).status).toBe(403);
    expect((await send("mutation", "sessions.appendMessage", "other-session")).status).toBe(403);
    expect((await send("mutation", "sessions.appendMessage", "own-session", "household-token")).status).toBe(401);
    expect((await send("action", "sessions.complete")).status).toBe(403);
    expect((await send("query", "sessions.complete")).status).toBe(403);
    expect(calls).toEqual(["sessions.appendMessage", "sessions.getStatus"]);
  } finally { bridge.close(); }
  await expect(send("mutation", "sessions.appendMessage")).rejects.toThrow();
});

test("sandboxed Worker child skips denied env files and completes scoped Session reporting", async () => {
  if (process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec")) return;
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const cwd = await mkdtemp(path.join(os.tmpdir(), "factory-session-bootstrap-"));
  const evidence = path.join(cwd, ".factory-evidence");
  const calls: Array<{ ref: string; args: Record<string, unknown> }> = [];
  const client = { url: "local", mutation: async (ref: string, args: Record<string, unknown>) => { calls.push({ ref, args }); return null; } } as unknown as Mailbox;
  const bridge = startSessionBridge(client, "bootstrap-session");
  try {
    await mkdir(evidence);
    await writeFile(path.join(cwd, ".env.local"), "FACTORY_BOOTSTRAP_FIXTURE=denied\n");
    const protection = workflowExecutionProtection(root);
    const sandbox = inspectionSandboxArgs([root, cwd], evidence, [], { ...protection, secretPaths: [...protection.secretPaths, path.join(cwd, ".env.local")] });
    const launch = { sessionId: "bootstrap-session", prompt: "Local mock bootstrap", provider: "codex", model: "mock", effort: "low", permissionMode: "supervised", serviceTier: "standard", images: [], project: { id: "bootstrap-project", name: "Bootstrap fixture", kind: "web", localPath: cwd, githubRepo: "" } };
    const run = async (flags: string[]) => {
      const child = Bun.spawn([...sandbox, process.execPath, ...flags, path.join(root, "worker/index.ts"), "--execute-session"], { cwd, stdin: "pipe", stdout: "pipe", stderr: "pipe", env: sessionExecutionEnvironment({ ...process.env, NODE_ENV: "development", FACTORY_MOCK: "1" }) });
      const timeout = setTimeout(() => child.kill(), 10_000);
      child.stdin.write(JSON.stringify({ launch, workerUrl: bridge.workerUrl, token: bridge.token })); child.stdin.end();
      try {
        const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text(), new Response(child.stdout).text()]);
        return { code, stderr };
      } finally { clearTimeout(timeout); }
    };
    expect((await run([])).code).not.toBe(0);
    expect(calls).toHaveLength(0);
    const completed = await run(["--no-env-file"]);
    if (completed.code) throw new Error(`Sandboxed Worker bootstrap failed (${completed.code}): ${completed.stderr}`);
    expect(calls.map(call => call.ref)).toEqual(["sessions.bindAgent", "sessions.appendMessage", "sessions.complete"]);
    expect(calls.every(call => call.args.sessionId === launch.sessionId)).toBe(true);
    expect(calls[1]?.args.text).toBe("mock codex reply");
  } finally { bridge.close(); await rm(cwd, { recursive: true, force: true }); }
}, 25_000);
