// Shared presentation for Roadmap statuses and kinds, used by the list and the detail pane.
import { Easing } from "react-native-reanimated";
import type { IconName } from "@/components/icon-button";
import type { useTheme } from "@/hooks/use-theme";
import type { GithubLink, RoadmapKind, RoadmapStatus } from "../../../shared/roadmap";

type Theme = ReturnType<typeof useTheme>;

export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const MOTION_MS = 200;

export const STATUS: Record<RoadmapStatus, { label: string; icon: IconName }> = {
  idea: { label: "Idea", icon: "idea" },
  planned: { label: "Planned", icon: "planned" },
  in_progress: { label: "In progress", icon: "inProgress" },
  done: { label: "Done", icon: "done" },
  dropped: { label: "Dropped", icon: "dropped" },
};

export function statusColor(theme: Theme, status: RoadmapStatus) {
  if (status === "in_progress") return theme.accent;
  if (status === "done") return theme.success;
  return theme.textSecondary;
}

export const KIND: Record<RoadmapKind, { label: string; icon: IconName }> = {
  feature: { label: "Feature", icon: "sparkles" },
  fix: { label: "Fix", icon: "wrench" },
};

export function kindColor(theme: Theme, kind: RoadmapKind) {
  return kind === "feature" ? theme.accent : theme.danger;
}

export const LINK_STATE: Record<NonNullable<GithubLink["state"]>, string> = {
  open: "Open",
  closed: "Closed",
  merged: "Merged",
};

export function linkStateColor(theme: Theme, state: GithubLink["state"]) {
  if (state === "merged") return theme.accent;
  if (state === "open") return theme.success;
  return theme.textSecondary;
}

export const isClosed = (status: RoadmapStatus) => status === "done" || status === "dropped";
