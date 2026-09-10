import { LANES, type Lane } from "../convex/lib/jobState";
import { ATTENTION_LANES, IN_PROGRESS_LANES } from "./jobsProgress";

function laneRank(lane: Lane) {
  if (ATTENTION_LANES.has(lane)) return 0;
  if (IN_PROGRESS_LANES.has(lane)) return 1;
  if (lane === "queued") return 2;
  if (lane === "pr") return 3;
  return 4;
}

export function stageTitle(stageKey: string) {
  return stageKey.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");
}

export function laneTitle(lane: string) {
  if (lane === "failed") return "Failed";
  return LANES.find((item) => item.id === lane)?.title ?? lane;
}

export function shouldShowStage(stageKey: string, lane: string) {
  const stage = stageTitle(stageKey).trim().toLowerCase();
  if (stage === "") return false;
  const title = laneTitle(lane).toLowerCase();
  return !title.includes(stage) && !stage.includes(title);
}

export function compareJobs(
  a: { lane: Lane; createdAt: number },
  b: { lane: Lane; createdAt: number },
) {
  const rank = laneRank(a.lane) - laneRank(b.lane);
  if (rank !== 0) return rank;
  return b.createdAt - a.createdAt;
}

export function jobsHeadline(args: {
  loading: boolean;
  visibleCount: number;
  scopedCount: number;
  attentionCount: number;
  scope: "all" | "project";
}) {
  const where = args.scope === "all" ? "View all" : "this Project";
  if (args.loading) {
    return args.scope === "all" ? "View all Jobs across Projects." : "Jobs in this Project.";
  }
  if (args.visibleCount === 0 && args.scopedCount > 0) {
    return `None of ${args.scopedCount} ${args.scopedCount === 1 ? "Job" : "Jobs"} in ${where} match.`;
  }
  const noun = args.visibleCount === 1 ? "Job" : "Jobs";
  if (args.visibleCount === 0) return `No ${noun} in ${where}.`;
  if (args.attentionCount === 0) return `${args.visibleCount} ${noun} in ${where}.`;
  if (args.attentionCount === args.visibleCount) {
    return args.visibleCount === 1
      ? `1 Job in ${where} needs you.`
      : `${args.visibleCount} Jobs in ${where} need you.`;
  }
  const need = args.attentionCount === 1 ? "1 needs you" : `${args.attentionCount} need you`;
  return `${args.visibleCount} ${noun} in ${where}. ${need}.`;
}

export function formatJobAge(timestamp: number, now = Date.now()) {
  const date = new Date(timestamp);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const thatDay = new Date(date);
  thatDay.setHours(0, 0, 0, 0);
  const deltaDays = Math.round((today.getTime() - thatDay.getTime()) / 86_400_000);
  if (deltaDays === 0) return "Today";
  if (deltaDays === 1) return "Yesterday";
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

export function doneNudgeLabel(hiddenDone: number) {
  if (hiddenDone <= 0) return "";
  return hiddenDone === 1 ? "Show 1 Done" : `Show ${hiddenDone} Done`;
}
