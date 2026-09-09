/** Compact wall-clock duration for Jobs, Stages, and Runs. */
export function formatDuration(ms: number | null | undefined): string | null {
  if (ms === undefined || ms === null || ms < 0) return null;
  if (ms < 1000) return "<1s";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (totalMin < 60) return sec === 0 ? `${totalMin}m` : `${totalMin}m ${sec}s`;
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hours < 24) return min === 0 ? `${hours}h` : `${hours}h ${min}m`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH === 0 ? `${days}d` : `${days}d ${remH}h`;
}

export function runDurationMs(
  run: { startedAt?: number; endedAt?: number; durationMs?: number },
  now: number = Date.now(),
): number | null {
  if (run.durationMs !== undefined) return run.durationMs;
  if (run.startedAt !== undefined && run.endedAt !== undefined) {
    return Math.max(0, run.endedAt - run.startedAt);
  }
  if (run.startedAt !== undefined) return Math.max(0, now - run.startedAt);
  return null;
}

/** Job total = stored completed Runs + any still-open Run clocks. */
export function jobDurationMs(
  job: { durationMs?: number },
  runs: ReadonlyArray<{ startedAt?: number; endedAt?: number; durationMs?: number }>,
  now: number = Date.now(),
): number | null {
  let total = job.durationMs ?? 0;
  let any = job.durationMs !== undefined && job.durationMs > 0;
  for (const run of runs) {
    if (run.endedAt !== undefined || run.durationMs !== undefined) continue;
    if (run.startedAt === undefined) continue;
    total += Math.max(0, now - run.startedAt);
    any = true;
  }
  return any || total > 0 ? total : null;
}
