import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import { api } from "../convex/_generated/api";

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
const url = env.CONVEX_URL ?? env.VITE_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL missing. Run convex dev first.");

const client = new ConvexHttpClient(url);
const projects = await client.query(api.projects.list, {});
let project = projects.find((row) => row.name === "Factory");
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
console.log("verified", { sessionId, status: view.session.status });
