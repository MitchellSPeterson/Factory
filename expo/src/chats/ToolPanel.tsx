import type { ProjectOption } from "@/lib/project-scope";

export type ToolTab = "files" | "git" | "terminal" | "device";

export type ToolPanelProps = {
  project?: ProjectOption;
  tab: ToolTab;
  open: boolean;
};

/** Desktop web only (ToolPanel.web.tsx); phones keep the full-screen panels in chats.tsx. */
export function ToolPanel(_: ToolPanelProps) {
  return null;
}
