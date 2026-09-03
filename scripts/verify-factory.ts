import { ConvexHttpClient } from "convex/browser";
import { readFileSync } from "node:fs";
import path from "node:path";
import { api } from "../convex/_generated/api";
import { laneOf } from "../convex/lib/jobState";
import { loadSkillFiles } from "../worker/seedSkills";

function envFromLocal(): Record<string, string> {
  const file = path.join(process.cwd(), ".env.local");
  try {
    const text = readFileSync(file, "utf8");
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

async function wait<T>(
  label: string,
  fn: () => Promise<T | null | undefined>,
  timeoutMs = 30_000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${label}`);
    await Bun.sleep(400);
  }
}

const env = { ...envFromLocal(), ...process.env };
const url = env.CONVEX_URL ?? env.VITE_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL missing. Run convex dev first.");

const client = new ConvexHttpClient(url);
const skills = await loadSkillFiles(process.cwd());
await client.mutation(api.seed.ensure, { skills });

const projects = await client.query(api.projects.list, {});
let project = projects.find((p) => p.name === "Factory");
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

const jobId = await client.mutation(api.jobs.create, {
  projectId: project._id,
  request: "Add a Jobs filter by status. Spec is thin on purpose.",
  runtime: "local",
  forceGrill: true,
});

const pending = await wait("grill ask", async () => {
  const view = await client.query(api.jobs.get, { jobId });
  return view?.pendingAsk ?? null;
});

await client.mutation(api.jobs.answerAsk, {
  askId: pending._id,
  answers: pending.questions.map((q) => ({
    id: q.id,
    text: q.recommend || "smallest slice",
  })),
});

await wait("planReview", async () => {
  const view = await client.query(api.jobs.get, { jobId });
  return laneOf(view?.job.status ?? "") === "planReview" ? view : null;
});

await client.mutation(api.jobs.acceptSpec, { jobId });

const implement = await wait("implement agent id", async () => {
  const view = await client.query(api.jobs.get, { jobId });
  return (
    view?.runs.find((r) => r.stageKey === "implement" && r.agentId) ?? null
  );
});

if (!implement.agentId) throw new Error("implement run has no agent id");

await wait("codeReview", async () => {
  const view = await client.query(api.jobs.get, { jobId });
  return laneOf(view?.job.status ?? "") === "codeReview" ? view : null;
});

await client.mutation(api.jobs.acceptCodeReview, { jobId });

await wait("pr", async () => {
  const view = await client.query(api.jobs.get, { jobId });
  return laneOf(view?.job.status ?? "") === "pr" ? view : null;
});

console.log("verified", { jobId, agentId: implement.agentId, lane: "pr" });
