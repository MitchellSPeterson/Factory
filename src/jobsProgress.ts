import { type Lane } from "../convex/lib/jobState";

export const ATTENTION_LANES = new Set<Lane>(["needsDetail", "planReview", "codeReview", "failed"]);
export const IN_PROGRESS_LANES = new Set<Lane>(["planning", "building"]);

export type ProgressFilter =
  | "active"
  | "all"
  | "queued"
  | "inProgress"
  | "attention"
  | "done"
  | "failed";

export const PROGRESS_OPTIONS: Array<{ id: ProgressFilter; title: string }> = [
  { id: "active", title: "Active" },
  { id: "all", title: "All" },
  { id: "queued", title: "Queued" },
  { id: "inProgress", title: "In progress" },
  { id: "attention", title: "Needs attention" },
  { id: "done", title: "Done" },
  { id: "failed", title: "Failed" },
];

export function matchesProgress(lane: Lane, progress: ProgressFilter): boolean {
  if (progress === "all") return true;
  if (progress === "active") return lane !== "pr";
  if (progress === "queued") return lane === "queued";
  if (progress === "inProgress") return IN_PROGRESS_LANES.has(lane);
  if (progress === "attention") return ATTENTION_LANES.has(lane);
  if (progress === "done") return lane === "pr";
  if (progress === "failed") return lane === "failed";
  return true;
}
