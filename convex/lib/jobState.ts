export type Lane =
  | "queued"
  | "needsDetail"
  | "planning"
  | "planReview"
  | "building"
  | "codeReview"
  | "pr"
  | "failed";

export type JobStatus = Lane;

export type StageKey = string;

export const LANES = [
  { id: "queued" as const, title: "Queued" },
  { id: "needsDetail" as const, title: "Needs Grilling" },
  { id: "planning" as const, title: "Planning" },
  { id: "planReview" as const, title: "Plan Review" },
  { id: "building" as const, title: "Building" },
  { id: "codeReview" as const, title: "Code Review" },
  { id: "pr" as const, title: "PR" },
];

const ALLOWED: Record<Lane, readonly Lane[]> = {
  queued: ["planning", "needsDetail", "building", "failed"],
  needsDetail: ["planning", "failed"],
  planning: ["needsDetail", "planReview", "failed"],
  planReview: ["building", "planning", "pr", "failed"],
  building: ["codeReview", "pr", "failed"],
  codeReview: ["pr", "building", "failed"],
  pr: ["failed"],
  failed: [],
};

const LEGACY: Record<string, Lane> = {
  awaitingAsk: "needsDetail",
  awaitingSpec: "planReview",
  implementing: "building",
  verifying: "building",
  openingPr: "pr",
  done: "pr",
};

export function laneOf(status: string): Lane {
  if (status in ALLOWED) return status as Lane;
  return LEGACY[status] ?? "queued";
}

/** Lane while a Stage runs. Explicit Stage.lane wins; else key heuristics. */
export function runningLane(stage: {
  key: string;
  lane?: string;
}): Lane {
  if (stage.lane === "planning" || stage.lane === "building" || stage.lane === "pr") {
    return stage.lane;
  }
  if (stage.key === "plan") return "planning";
  if (stage.key === "pr") return "pr";
  return "building";
}

export function canTransition(from: string, to: string): boolean {
  return ALLOWED[laneOf(from)].includes(laneOf(to));
}

export function assertTransition(from: string, to: string): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal job transition ${from} → ${to}`);
  }
}

export type PlanVerdict = {
  size: "small" | "large";
  specQuality: "thin" | "enough";
};

export function parsePlanVerdict(body: string): PlanVerdict | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "size" in parsed &&
      "specQuality" in parsed &&
      (parsed.size === "small" || parsed.size === "large") &&
      (parsed.specQuality === "thin" || parsed.specQuality === "enough")
    ) {
      return { size: parsed.size, specQuality: parsed.specQuality };
    }
    return null;
  } catch {
    return null;
  }
}

export function largeAndThinSpec(
  forceGrill: boolean,
  verdict: PlanVerdict | null,
): boolean {
  if (forceGrill) return true;
  if (!verdict) return false;
  return verdict.size === "large" && verdict.specQuality === "thin";
}
