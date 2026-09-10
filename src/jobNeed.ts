import { laneOf, parsePlanVerdict } from "../convex/lib/jobState";

export type JobNeed = "ask" | "planReview" | "codeReview" | "failed" | "none";

export function jobNeed(args: { status: string; hasPendingAsk: boolean }): JobNeed {
  if (args.hasPendingAsk) return "ask";
  const lane = laneOf(args.status);
  if (lane === "planReview") return "planReview";
  if (lane === "codeReview") return "codeReview";
  if (lane === "failed") return "failed";
  return "none";
}

export function jobNeedHeading(need: JobNeed) {
  switch (need) {
    case "ask":
      return "Needs Grilling";
    case "planReview":
      return "Plan Review";
    case "codeReview":
      return "Code Review";
    case "failed":
      return "This Job failed";
    case "none":
      return "";
  }
}

export function formatPlanVerdictLabel(body: string) {
  const verdict = parsePlanVerdict(body);
  if (!verdict) return null;
  const size = verdict.size === "large" ? "Large" : "Small";
  const spec = verdict.specQuality === "enough" ? "spec is enough" : "spec is thin";
  return `${size} · ${spec}`;
}

export function hideArtifactInStage(kind: string, need: JobNeed) {
  return need === "planReview" && (kind === "spec" || kind === "plan_verdict");
}

export function formatJobActivity(activity: string) {
  if (activity === "waitingOnHuman") return "Waiting on you";
  if (activity === "working") return "Working";
  if (activity === "parked") return "Parked";
  if (activity === "done") return "Done";
  if (activity === "failed") return "Failed";
  return activity;
}
