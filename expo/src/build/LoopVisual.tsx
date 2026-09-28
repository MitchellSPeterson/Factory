// The Helix Loop, drawn from Views (no react-native-svg dependency in this app):
// Tests → Implement → Behavior → UI → Review → Commit, with a return arc that lights up
// from whichever Gate just failed back to Implement.
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/use-theme";
import { IconNames, type IconName } from "@/components/icon-button";
import type { BuildFields, GateState } from "../../../shared/helix";
import { LOOP_NODES, gateStateColor, loopNodeState, reworkOrigin, type LoopNodeKey } from "./meta";

// Center-x fraction of a node in the row, derived from its position among LOOP_NODES.
const nodeX = (key: LoopNodeKey) => (LOOP_NODES.findIndex((n) => n.key === key) + 0.5) / LOOP_NODES.length;

export function LoopVisual({
  build,
}: {
  build: Pick<BuildFields, "step" | "status" | "checkpoints" | "current" | "checkCommand">;
}) {
  const theme = useTheme();
  const [rowWidth, setRowWidth] = useState(0);
  const origin = reworkOrigin(build);

  return (
    <View style={styles.root}>
      <View style={styles.row} onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
        {rowWidth > 0 && origin ? (
          <ReturnArc theme={theme} width={rowWidth} fromX={nodeX(origin)} toX={nodeX("implement")} />
        ) : null}
        {LOOP_NODES.map((node, i) => (
          <View key={node.key} style={styles.slot}>
            <Node node={node} state={loopNodeState(build, node.key)} />
            {i < LOOP_NODES.length - 1 ? (
              <View
                style={[
                  styles.connector,
                  { backgroundColor: connectorColor(theme, loopNodeState(build, node.key)) },
                ]}
              />
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function connectorColor(theme: ReturnType<typeof useTheme>, before: GateState) {
  return before === "pass" || before === "skipped" ? theme.lineStrong : theme.line;
}

function ReturnArc({
  theme,
  width,
  fromX,
  toX,
}: {
  theme: ReturnType<typeof useTheme>;
  width: number;
  fromX: number;
  toX: number;
}) {
  const left = toX * width;
  const right = fromX * width;
  return (
    <View pointerEvents="none" style={[styles.arc, { left, width: right - left, borderColor: theme.danger }]}>
      <SymbolView
        name={IconNames.chevronRight}
        size={10}
        tintColor={theme.danger}
        style={{ transform: [{ scaleX: -1 }], position: "absolute", left: -5, bottom: -6 }}
      />
    </View>
  );
}

function Node({ node, state }: { node: { key: LoopNodeKey; label: string; icon: IconName }; state: GateState }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);
  const running = state === "running";

  useEffect(() => {
    if (running && !reduced) {
      pulse.value = withRepeat(withTiming(0.45, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true);
    } else {
      pulse.value = withTiming(1, { duration: 150 });
    }
  }, [running, reduced, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const color = gateStateColor(theme, state);

  return (
    <View style={styles.node}>
      <Animated.View
        style={[
          styles.circle,
          {
            borderColor: color,
            backgroundColor: state === "pass" || state === "running" ? color : "transparent",
          },
          running && pulseStyle,
        ]}
      >
        <SymbolView
          name={IconNames[node.icon]}
          size={16}
          tintColor={state === "pass" || state === "running" ? theme.background : color}
        />
      </Animated.View>
      <Text numberOfLines={1} style={[styles.label, { color: state === "waiting" ? theme.textSecondary : theme.text }]}>
        {node.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingTop: 4, paddingBottom: 14 },
  row: { flexDirection: "row", alignItems: "flex-start" },
  slot: { flex: 1, flexDirection: "row", alignItems: "flex-start" },
  node: { alignItems: "center", gap: 6, width: 56 },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  connector: { flex: 1, height: 2, marginTop: 19 },
  arc: {
    position: "absolute",
    top: 54,
    height: 10,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
});
