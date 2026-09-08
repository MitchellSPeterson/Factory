import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";

const CONVEX_URL = process.env.CONVEX_URL;
const RUN_ID = process.env.FACTORY_RUN_ID;
if (!CONVEX_URL || !RUN_ID) {
  console.error("CONVEX_URL and FACTORY_RUN_ID are required");
  process.exit(1);
}

const TOOLS = [
  {
    name: "ask_human",
    description:
      "Ask the human a frontier of questions. Blocks until they answer in the Factory UI.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["grill", "generic"] },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              body: { type: "string" },
              recommend: { type: "string" },
            },
            required: ["id", "title", "body", "recommend"],
          },
        },
      },
      required: ["questions"],
    },
  },
  {
    name: "submit_artifact",
    description: "Store a durable stage artifact.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["plan_verdict", "spec", "pr_url"] },
        body: { type: "string" },
      },
      required: ["kind", "body"],
    },
  },
  {
    name: "finish_stage",
    description: "End this stage.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["finished", "failed"] },
        error: { type: "string" },
      },
      required: ["status"],
    },
  },
];

async function convex(path, args) {
  const res = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path,
      args,
      format: "json",
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  if (json.status === "error") throw new Error(json.errorMessage ?? "convex error");
  return json.value;
}

async function convexQuery(path, args) {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  if (json.status === "error") throw new Error(json.errorMessage ?? "convex error");
  return json.value;
}

async function callTool(name, args) {
  if (name === "ask_human") {
    const askId = await convex("worker:openAsk", {
      runId: RUN_ID,
      kind: args.kind ?? "grill",
      questions: args.questions,
    });
    for (;;) {
      const ask = await convexQuery("worker:getAsk", { askId });
      if (ask?.status === "answered") {
        return JSON.stringify({ answers: ask.answers ?? [] });
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (name === "submit_artifact") {
    const result = await convex("worker:submitArtifact", {
      runId: RUN_ID,
      kind: args.kind,
      body: args.body,
    });
    return JSON.stringify(result);
  }
  if (name === "finish_stage") {
    await convex("worker:finishStage", {
      runId: RUN_ID,
      status: args.status,
      error: args.error,
    });
    return "ok";
  }
  throw new Error(`unknown tool ${name}`);
}

function write(msg) {
  const json = JSON.stringify(msg);
  if (process.env.FACTORY_MCP_TRANSPORT === "jsonl") { stdout.write(json + "\n"); return; }
  const buf = Buffer.from(json, "utf8");
  stdout.write(`Content-Length: ${buf.length}\r\n\r\n`);
  stdout.write(buf);
}

let buffer = Buffer.alloc(0);
if (process.env.FACTORY_MCP_TRANSPORT === "jsonl") {
  createInterface({ input: stdin }).on("line", line => {
    try { void handle(JSON.parse(line)); } catch { write({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Invalid JSON" } }); }
  });
} else stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const header = buffer.subarray(0, headerEnd).toString("utf8");
    const match = header.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      buffer = buffer.subarray(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) return;
    const body = buffer.subarray(start, start + length).toString("utf8");
    buffer = buffer.subarray(start + length);
    void handle(JSON.parse(body));
  }
});

async function handle(msg) {
  const id = msg.id;
  try {
    if (msg.method === "initialize") {
      write({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: msg.params?.protocolVersion ?? "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "factory", version: "0.0.1" },
        },
      });
      return;
    }
    if (msg.method === "notifications/initialized") return;
    if (msg.method === "tools/list") {
      write({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      return;
    }
    if (msg.method === "tools/call") {
      const text = await callTool(msg.params.name, msg.params.arguments ?? {});
      write({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text }] },
      });
      return;
    }
    if (id !== undefined) {
      write({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${msg.method}` },
      });
    }
  } catch (err) {
    if (id !== undefined) {
      write({
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: String(err) },
      });
    }
  }
}
