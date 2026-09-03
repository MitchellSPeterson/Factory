import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  largeAndThinSpec,
  parsePlanVerdict,
  type PlanVerdict,
} from "./jobState";
import { sortStages } from "./recipeGraph";

export async function requireProject(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
): Promise<Doc<"projects">> {
  const project = await ctx.db.get(projectId);
  if (!project) throw new Error("Project not found");
  return project;
}

export async function requireJob(
  ctx: QueryCtx | MutationCtx,
  jobId: Id<"jobs">,
): Promise<Doc<"jobs">> {
  const job = await ctx.db.get(jobId);
  if (!job) throw new Error("Job not found");
  return job;
}

export async function requireRun(
  ctx: QueryCtx | MutationCtx,
  runId: Id<"runs">,
): Promise<Doc<"runs">> {
  const run = await ctx.db.get(runId);
  if (!run) throw new Error("Run not found");
  return run;
}

export async function latestVerdict(
  ctx: QueryCtx | MutationCtx,
  jobId: Id<"jobs">,
): Promise<PlanVerdict | null> {
  const rows = await ctx.db
    .query("artifacts")
    .withIndex("by_job_and_kind", (q) =>
      q.eq("jobId", jobId).eq("kind", "plan_verdict"),
    )
    .collect();
  const last = rows[rows.length - 1];
  return last ? parsePlanVerdict(last.body) : null;
}

export async function latestSpec(
  ctx: QueryCtx | MutationCtx,
  jobId: Id<"jobs">,
): Promise<string | null> {
  const rows = await ctx.db
    .query("artifacts")
    .withIndex("by_job_and_kind", (q) => q.eq("jobId", jobId).eq("kind", "spec"))
    .collect();
  return rows[rows.length - 1]?.body ?? null;
}

export async function answeredGrillCount(
  ctx: QueryCtx | MutationCtx,
  jobId: Id<"jobs">,
): Promise<number> {
  const asks = await ctx.db
    .query("asks")
    .withIndex("by_job", (q) => q.eq("jobId", jobId))
    .collect();
  return asks.filter((a) => a.kind === "grill" && a.status === "answered")
    .length;
}

export async function pendingAskForRun(
  ctx: QueryCtx | MutationCtx,
  runId: Id<"runs">,
) {
  const asks = await ctx.db
    .query("asks")
    .withIndex("by_run", (q) => q.eq("runId", runId))
    .collect();
  return asks.find((a) => a.status === "pending") ?? null;
}

export async function stagesOfRecipe(
  ctx: QueryCtx | MutationCtx,
  recipeId: Id<"recipes">,
): Promise<Doc<"stages">[]> {
  const stages = await ctx.db
    .query("stages")
    .withIndex("by_recipe", (q) => q.eq("recipeId", recipeId))
    .collect();
  return sortStages(stages);
}

export function gateOpen(
  forceGrill: boolean,
  verdict: PlanVerdict | null,
  gate: "largeAndThinSpec" | undefined,
): boolean {
  if (!gate) return true;
  return largeAndThinSpec(forceGrill, verdict);
}
