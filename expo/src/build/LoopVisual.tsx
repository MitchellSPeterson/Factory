// The Helix Loop: Tests → Implement → Behavior → UI → Review → Commit,
// with a return arc from the Gate that just failed back to Implement.
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useCSSVariable } from "uniwind";
import { IconNames, type IconName } from "@/components/icon-button";
import type { BuildFields, GateState } from "../../../shared/helix";
import { LOOP_NODES, loopNodeState, reworkOrigin, type LoopNodeKey } from "./meta";

const nodeX = (key: LoopNodeKey) => (LOOP_NODES.findIndex((n) => n.key === key) + 0.5) / LOOP_NODES.length;

function usePalette() {
  const [success, danger, primary, muted, foreground, line, lineStrong, background] = useCSSVariable([
    "--color-success",
    "--color-destructive",
    "--color-primary",
    "--color-muted-foreground",
    "--color-foreground",
    "--color-border",
    "--color-input",
    "--color-background",
  ]) as (string | undefined)[];
  return { success, danger, primary, muted, foreground, line, lineStrong, background };
}

function stateColor(palette: ReturnType<typeof usePalette>, state: GateState) {
  if (state === "pass") return palette.success;
  if (state === "fail") return palette.danger;
  if (state === "running") return palette.primary;
  return palette.muted;
}

export function LoopVisual({
  build,
}: {
  build: Pick<BuildFields, "step" | "status" | "checkpoints" | "current" | "checkCommand">;
}) {
  const palette = usePalette();
  const [rowWidth, setRowWidth] = useState(0);
  const origin = reworkOrigin(build);

  return (
    <View className="pb-3.5 pt-1">
      <View className="flex-row items-start" onLayout={(e) => setRowWidth(e.nativeEvent.layout.width)}>
        {rowWidth > 0 && origin ? (
          <ReturnArc width={rowWidth} fromX={nodeX(origin)} toX={nodeX("implement")} color={palette.danger} />
        ) : null}
        {LOOP_NODES.map((node, i) => {
          const state = loopNodeState(build, node.key);
          const passed = state === "pass" || state === "skipped";
          return (
            <View key={node.key} className="flex-1 flex-row items-start">
              <Node node={node} state={state} />
              {i < LOOP_NODES.length - 1 ? (
                <View
                  className="mt-[19px] h-0.5 flex-1"
                  style={{ backgroundColor: passed ? palette.lineStrong : palette.line }}
                />
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ReturnArc({
  width,
  fromX,
  toX,
  color,
}: {
  width: number;
  fromX: number;
  toX: number;
  color?: string;
}) {
  const left = toX * width;
  const right = fromX * width;
  return (
    <View
      pointerEvents="none"
      className="absolute top-[54px] h-2.5 border-b-2 border-l-2 border-r-2"
      style={{
        left,
        width: right - left,
        borderColor: color,
        borderBottomLeftRadius: 6,
        borderBottomRightRadius: 6,
      }}>
      <SymbolView
        name={IconNames.chevronRight}
        size={10}
        tintColor={color}
        style={{ transform: [{ scaleX: -1 }], position: "absolute", left: -5, bottom: -6 }}
      />
    </View>
  );
}

function Node({ node, state }: { node: { key: LoopNodeKey; label: string; icon: IconName }; state: GateState }) {
  const palette = usePalette();
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
  const color = stateColor(palette, state);
  const filled = state === "pass" || state === "running";

  return (
    <View className="w-14 items-center gap-1.5">
      <Animated.View
        className="h-10 w-10 items-center justify-center rounded-full border-2"
        style={[{ borderColor: color, backgroundColor: filled ? color : "transparent" }, running && pulseStyle]}>
        <SymbolView name={IconNames[node.icon]} size={16} tintColor={filled ? palette.background : color} />
      </Animated.View>
      <Text
        numberOfLines={1}
        className={`text-center text-[10px] font-semibold ${state === "waiting" ? "text-muted-foreground" : "text-foreground"}`}>
        {node.label}
      </Text>
    </View>
  );
}
