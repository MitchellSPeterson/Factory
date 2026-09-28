// Shared presentation for Builds: gate labels, colors, and the loop's node states.
// Motion/easing constants live in roadmap/meta.ts (EASE_OUT, MOTION_MS) — reused, not duplicated.
import type { IconName } from "@/components/icon-button";
import type { useTheme } from "@/hooks/use-theme";
import type { BuildFields, BuildStatus, GateKey, GateState } from "../../../shared/helix";

type Theme = ReturnType<typeof useTheme>;

export const GATE_LABEL: Record<GateKey, string> = { behavior: "Behavior", ui: "UI", review: "Review" };

export const BUILD_STATUS_LABEL: Record<BuildStatus, string> = {
  running: "Running",
  waiting: "Waiting on you",
  paused: "Paused",
  done: "Done",
  stopped: "Stopped",
};

export function buildStatusColor(theme: Theme, status: BuildStatus) {
  if (status === "done") return theme.success;
  if (status === "paused") return theme.danger;
  if (status === "stopped") return theme.textSecondary;
  return theme.accent; // running / waiting
}

export function gateStateColor(theme: Theme, state: GateState) {
  if (state === "pass") return theme.success;
  if (state === "fail") return theme.danger;
  if (state === "running") return theme.accent;
  return theme.textSecondary; // waiting / skipped
}

export const GATE_STATE_LABEL: Record<GateState, string> = {
  waiting: "Waiting",
  running: "Running",
  pass: "Passed",
  fail: "Failed",
  skipped: "Skipped",
};

/** The loop's six nodes, in order: Tests → Implement → Behavior → UI → Review → Commit. */
export type LoopNodeKey = "tests" | "implement" | GateKey | "commit";
export const LOOP_NODES: { key: LoopNodeKey; label: string; icon: IconName }[] = [
  { key: "tests", label: "Tests", icon: "check" },
  { key: "implement", label: "Implement", icon: "compose" },
  { key: "behavior", label: "Behavior", icon: "wrench" },
  { key: "ui", label: "UI", icon: "screenshot" },
  { key: "review", label: "Review", icon: "review" },
  { key: "commit", label: "Commit", icon: "commit" },
];

/** Tests/Implement/Commit aren't Gates, so derive a GateState-shaped status for them from the Step. */
export function loopNodeState(
  build: Pick<BuildFields, "step" | "status" | "checkpoints" | "current" | "checkCommand">,
  key: LoopNodeKey,
): GateState {
  const cp = build.checkpoints[build.current];
  if (!cp) return "waiting";
  if (key === "tests") {
    if (!build.checkCommand.trim() || !cp.tests) return "skipped";
    if (build.step.kind === "writeTests") return "running";
    return cp.attempts > 0 ? "pass" : "waiting";
  }
  if (key === "implement") {
    if (build.step.kind === "implement") return build.status === "paused" ? "fail" : "running";
    return cp.attempts > 0 ? "pass" : "waiting";
  }
  if (key === "commit") {
    if (build.step.kind === "commit") return "running";
    return cp.status === "done" ? "pass" : "waiting";
  }
  return cp.gates[key];
}

/** While reworking, exactly one Gate carries "fail" — that's the node the return arc points back from. */
export function reworkOrigin(build: Pick<BuildFields, "step" | "checkpoints" | "current">): GateKey | null {
  if (build.step.kind !== "implement") return null;
  const cp = build.checkpoints[build.current];
  if (!cp) return null;
  const gates = Object.keys(cp.gates) as GateKey[];
  return gates.find((k) => cp.gates[k] === "fail") ?? null;
}
