import { useEffect, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { DevicesView } from "@/app/(drawer)/devices.web";
import { ProjectTerminals } from "@/app/(drawer)/terminal";
import { FilesPanel } from "@/chats/FilesPanel";
import { Notice } from "@/chats/ui";
import { GitWorkspace } from "@/git/GitWorkspace";
import type { ToolPanelProps, ToolTab } from "./ToolPanel";

export type { ToolTab } from "./ToolPanel";

const WIDTH_KEY = "factory.toolPanelWidth";
const MIN_WIDTH = 360;
// Sidebar (280) + the narrowest chat column worth keeping.
const RESERVED = 280 + 420;

function savedWidth() {
  try {
    const value = Number(localStorage.getItem(WIDTH_KEY));
    return value >= MIN_WIDTH ? value : 560;
  } catch {
    return 560;
  }
}

/** Codex-style right panel: slides out beside the chat, drag its left edge to resize. */
export function ToolPanel({ project, tab, open }: ToolPanelProps) {
  const reduced = useReducedMotion();
  const { width: windowWidth } = useWindowDimensions();
  const [wanted, setWanted] = useState(savedWidth);
  const [dragging, setDragging] = useState(false);
  // Tabs stay mounted once opened so terminals and streams survive switching.
  const [visited, setVisited] = useState<ToolTab[]>([tab]);
  useEffect(() => {
    if (open) setVisited((prev) => (prev.includes(tab) ? prev : [...prev, tab]));
  }, [open, tab]);

  const width = Math.max(MIN_WIDTH, Math.min(wanted, windowWidth - RESERVED));

  function body(id: ToolTab) {
    if (id === "device") return <DevicesView embedded />;
    if (!project) return <Notice text="Choose a Project to see its files, git, and terminals." />;
    if (id === "files")
      return (
        <FilesPanel
          key={project._id}
          projectId={project._id}
          projectName={project.name}
          visible={open && tab === "files"}
        />
      );
    if (id === "git") return <GitWorkspace key={project._id} project={project} compact />;
    return <ProjectTerminals key={project._id} project={project} />;
  }

  return (
    <View
      className={`shrink-0 flex-row overflow-hidden bg-background ${open ? "border-l border-border" : ""}`}
      style={
        {
          width: open ? width : 0,
          transitionProperty: "width",
          transitionDuration: dragging || reduced ? "0ms" : "220ms",
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        } as object
      }
    >
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Resize panel"
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={() => {
          setDragging(true);
          // Keep the drag from selecting chat text, and hold the resize cursor off the handle.
          document.body.style.userSelect = "none";
          document.body.style.cursor = "col-resize";
        }}
        onResponderMove={(e) => setWanted(windowWidth - e.nativeEvent.pageX)}
        onResponderRelease={() => {
          setDragging(false);
          document.body.style.userSelect = "";
          document.body.style.cursor = "";
          try {
            localStorage.setItem(WIDTH_KEY, String(width));
          } catch {}
        }}
        className="absolute -left-[3px] bottom-0 top-0 z-10 w-[7px]"
        style={{ cursor: "col-resize" } as object}
      />
      <View className="min-h-0 flex-1" style={{ width }}>
        {/* Iframes (terminal, device) would swallow the drag, so they sit out while resizing. */}
        <View
          className="min-h-0 flex-1"
          style={dragging ? ({ pointerEvents: "none" } as object) : undefined}
        >
          {visited.map((id) => (
            <View
              key={id}
              className="min-h-0 flex-1"
              style={{ display: id === tab ? "flex" : "none" }}
            >
              {body(id)}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
