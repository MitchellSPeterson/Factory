import { readFileSync } from "node:fs";
import { api } from "../shared/mailboxApi";
import { httpMailbox } from "../worker/mailbox/client";
import { loadIdentity } from "../worker/managed";

function envFromLocal(): Record<string, string> {
  try {
    const text = readFileSync(".env.local", "utf8");
    const out: Record<string, string> = {};
    for (const line of text.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match?.[1]) out[match[1]] = match[2] ?? "";
    }
    return out;
  } catch {
    return {};
  }
}

const env = { ...envFromLocal(), ...process.env };
const url = (env.FACTORY_WORKER_URL ?? "http://127.0.0.1:3402").replace(/\/$/, "");
const identity = await loadIdentity(process.cwd());
const client = httpMailbox(url, identity.pairingToken);
const projects = await client.query(api.projects.list, {});
let project = (projects as Array<{ _id: string; name: string }>).find((row) => row.name === "Factory");
if (!project) {
  const projectId = await client.mutation(api.projects.create, {
    name: "Factory",
    kind: "web",
    localPath: process.cwd(),
    githubRepo: "",
    defaultRuntime: "local",
  });
  project = await client.query(api.projects.get, { projectId });
}
if (!project) throw new Error("Factory project missing");

const sessionId = await client.mutation(api.sessions.create, {
  projectId: project._id,
  provider: "codex",
  model: "gpt-5.6-terra",
  effort: "medium",
  text: "Say ready.",
});
const view = await client.query(api.sessions.get, { sessionId });
if (!view) throw new Error("Session missing");
console.log("verified", { sessionId, status: (view as { session: { status: string } }).session.status });
