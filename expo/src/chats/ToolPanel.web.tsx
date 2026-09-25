import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { DevicesView } from "@/app/(drawer)/devices.web";
import { ProjectTerminals } from "@/app/(drawer)/terminal";
import { FilesPanel } from "@/chats/FilesPanel";
import { Notice } from "@/chats/ui";
import { IconButton } from "@/components/icon-button";
import { GitWorkspace } from "@/git/GitWorkspace";
import { useTheme } from "@/hooks/use-theme";
import type { ToolPanelProps, ToolTab } from "./ToolPanel";

export type { ToolTab } from "./ToolPanel";

const TABS: { id: ToolTab; label: string }[] = [
  { id: "files", label: "Files" },
  { id: "git", label: "Git" },
  { id: "terminal", label: "Terminal" },
  { id: "device", label: "Device" },
];
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
export function ToolPanel({ project, tab, open, onTab, onClose }: ToolPanelProps) {
  const theme = useTheme();
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
      style={[
        styles.clip,
        {
          width: open ? width : 0,
          borderLeftWidth: open ? 1 : 0,
          borderColor: theme.line,
          backgroundColor: theme.background,
          transitionProperty: "width",
          transitionDuration: dragging || reduced ? "0ms" : "220ms",
          transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)",
        } as object,
      ]}
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
        style={[styles.handle, { cursor: "col-resize" } as object]}
      />
      <View style={[styles.inner, { width }]}>
        <View style={[styles.bar, { borderBottomColor: theme.line }]}>
          {TABS.map((item) => {
            const active = item.id === tab;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => onTab(item.id)}
                style={(state) => [
                  styles.tab,
                  {
                    backgroundColor: active
                      ? theme.backgroundSelected
                      : (state as { hovered?: boolean }).hovered
                        ? theme.subtleHover
                        : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    { color: active ? theme.text : theme.textSecondary },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
          <View style={{ flex: 1 }} />
          <IconButton
            icon="close"
            accessibilityLabel="Close panel"
            onPress={onClose}
            style={styles.close}
          />
        </View>
        {/* Iframes (terminal, device) would swallow the drag, so they sit out while resizing. */}
        <View style={[styles.body, dragging && ({ pointerEvents: "none" } as object)]}>
          {visited.map((id) => (
            <View key={id} style={[styles.page, { display: id === tab ? "flex" : "none" }]}>
              {body(id)}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { flexShrink: 0, overflow: "hidden", flexDirection: "row" },
  handle: {
    position: "absolute",
    left: -3,
    top: 0,
    bottom: 0,
    width: 7,
    zIndex: 2,
  },
  inner: { flex: 1, minHeight: 0 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 44,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderCurve: "continuous",
    justifyContent: "center",
  },
  tabLabel: { fontSize: 13, fontWeight: "500" },
  close: { width: 32, height: 32, backgroundColor: "transparent" },
  body: { flex: 1, minHeight: 0 },
  page: { flex: 1, minHeight: 0 },
});
