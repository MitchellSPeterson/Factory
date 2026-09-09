import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/** Mark a Run as started when the worker claims it. */
export async function markRunStarted(
  ctx: MutationCtx,
  run: Doc<"runs">,
): Promise<void> {
  if (run.startedAt !== undefined) return;
  await ctx.db.patch(run._id, { startedAt: Date.now() });
}

/**
 * Close Run timing once. Adds duration into the Job total.
 * Safe to call repeatedly — second call is a no-op.
 */
export async function markRunEnded(
  ctx: MutationCtx,
  run: Doc<"runs">,
): Promise<number> {
  if (run.endedAt !== undefined) return 0;
  const endedAt = Date.now();
  const durationMs =
    run.startedAt !== undefined ? Math.max(0, endedAt - run.startedAt) : 0;
  await ctx.db.patch(run._id, { endedAt, durationMs });
  if (durationMs === 0) return 0;

  const job = await ctx.db.get(run.jobId);
  if (!job) return durationMs;
  await ctx.db.patch(job._id, {
    durationMs: (job.durationMs ?? 0) + durationMs,
  });
  return durationMs;
}
