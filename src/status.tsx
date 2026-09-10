const LABELS: Record<string, string> = {
  queued: "queued",
  needsDetail: "needs grilling",
  planning: "planning",
  planReview: "plan review",
  building: "building",
  codeReview: "code review",
  pr: "pr",
  failed: "failed",
  finished: "finished",
  running: "running",
  idle: "idle",
  stopped: "stopped",
};

export function Badge({ status }: { status: string }) {
  const kind =
    status === "pr" || status === "done" || status === "finished"
      ? "done"
      : status === "failed"
        ? "bad"
        : status === "planning" ||
            status === "building" ||
            status === "running"
          ? "progress"
          : status === "queued" ||
              status === "needsDetail" ||
              status === "planReview" ||
              status === "codeReview" ||
              status === "stopped" ||
              status.startsWith("awaiting")
            ? "wait"
            : "open";
  return <span className={`badge ${kind}`}>{LABELS[status] ?? status}</span>;
}
