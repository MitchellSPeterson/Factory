import { expect, test } from "bun:test";
import path from "node:path";

for (const transport of ["jsonl", "legacy"]) {
  test(`Factory MCP ${transport} supports initialization, Asks, Artifacts, and completion`, async () => {
    const calls: Array<{ path: string; args: Record<string, unknown> }> = [];
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
      const body = await req.json() as { path: string; args: Record<string, unknown> };
      calls.push(body);
      const value = body.path === "worker:openAsk" ? "ask-1" : body.path === "worker:getAsk" ? { status: "answered", answers: [{ id: "q", text: "Proceed" }] } : body.path === "worker:submitArtifact" ? { grillRequired: false } : null;
      return Response.json({ status: "success", value });
    } });
    const proc = Bun.spawn([process.execPath, path.resolve("worker/mcpStdio.mjs")], { stdin: "pipe", stdout: "pipe", stderr: "pipe", env: { ...process.env, CONVEX_URL: server.url.toString().replace(/\/$/, ""), FACTORY_RUN_ID: "run-1", FACTORY_MCP_TRANSPORT: transport } });
    const reader = proc.stdout.getReader();
    let buffer = "";
    async function request(id: number, method: string, params: Record<string, unknown> = {}) {
      const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
      proc.stdin.write(transport === "jsonl" ? body + "\n" : `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
      for (;;) {
        if (transport === "jsonl") {
          const end = buffer.indexOf("\n");
          if (end >= 0) { const result = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); return result; }
        } else {
          const end = buffer.indexOf("\r\n\r\n");
          if (end >= 0) {
            const length = Number(buffer.slice(0, end).match(/Content-Length: (\d+)/)?.[1]);
            if (buffer.length >= end + 4 + length) { const result = JSON.parse(buffer.slice(end + 4, end + 4 + length)); buffer = buffer.slice(end + 4 + length); return result; }
          }
        }
        const next = await reader.read();
        if (next.done) throw new Error("MCP exited before responding");
        buffer += new TextDecoder().decode(next.value);
      }
    }
    try {
      expect((await request(1, "initialize", { protocolVersion: "2024-11-05" })).result.capabilities).toEqual({ tools: {} });
      expect((await request(2, "tools/list")).result.tools.map((t: { name: string }) => t.name)).toEqual(["ask_human", "submit_artifact", "finish_stage"]);
      const ask = await request(3, "tools/call", { name: "ask_human", arguments: { questions: [{ id: "q", title: "Continue?", body: "Review", recommend: "Proceed" }] } });
      expect(JSON.parse(ask.result.content[0].text).answers).toEqual([{ id: "q", text: "Proceed" }]);
      await request(4, "tools/call", { name: "submit_artifact", arguments: { kind: "spec", body: "Reviewed" } });
      expect((await request(5, "tools/call", { name: "finish_stage", arguments: { status: "finished" } })).result.content[0].text).toBe("ok");
      expect(calls.filter(c => c.path !== "worker:getAsk").every(c => c.args.runId === "run-1")).toBe(true);
      expect(calls.at(-1)).toMatchObject({ path: "worker:finishStage", args: { runId: "run-1", status: "finished" } });
    } finally {
      proc.stdin.end(); proc.kill(); await proc.exited; server.stop(true);
    }
  });
}
