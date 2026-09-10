import { LANES, type Lane } from "../convex/lib/jobState";

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
  { id: "attention", title: "Needs attention" },
  { id: "inProgress", title: "In progress" },
  { id: "queued", title: "Queued" },
  { id: "done", title: "Done" },
  { id: "failed", title: "Failed" },
  { id: "all", title: "All" },
];

export function parseProgress(value: string | null): ProgressFilter {
  return PROGRESS_OPTIONS.some((option) => option.id === value)
    ? (value as ProgressFilter)
    : "active";
}

export function parseLane(value: string | null): string {
  if (value === "failed") return "failed";
  return LANES.some((lane) => lane.id === value) ? value! : "";
}

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
