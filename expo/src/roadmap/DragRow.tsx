// A draggable Roadmap row. Web drags from the handle; touch drags after press-and-hold
// anywhere on the row. On release it reports how far it moved; the list decides where
// that lands (reorder.ts) and re-renders optimistically, so the row springs home from
// its dragged offset while the layout transition slides it into its new slot.
import type { ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "@/hooks/use-theme";
import { IconNames } from "@/components/icon-button";
import { EASE_OUT, MOTION_MS } from "./meta";

const SPRING = { damping: 22, stiffness: 260, mass: 0.8 };
const LAYOUT = LinearTransition.duration(MOTION_MS).easing(EASE_OUT);

export function DragRow({
  rowRef,
  surface,
  onDrop,
  children,
}: {
  rowRef: (view: View | null) => void;
  surface: string; // list background, so a lifted row stays opaque over its neighbours
  onDrop: (translationY: number) => Promise<unknown>;
  children: ReactNode;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const translateY = useSharedValue(0);
  const lift = useSharedValue(0);

  function settle(dy: number) {
    void onDrop(dy).finally(() => {
      translateY.value = reduced ? 0 : withSpring(0, SPRING);
    });
  }

  const pan = Gesture.Pan()
    .onStart(() => {
      lift.value = withTiming(1, { duration: 120 });
    })
    .onUpdate((e) => {
      translateY.value = e.translationY;
    })
    .onEnd((e) => {
      lift.value = withTiming(0, { duration: 160 });
      runOnJS(settle)(e.translationY);
    })
    .onFinalize((_e, success) => {
      if (success) return;
      lift.value = withTiming(0, { duration: 160 });
      translateY.value = withSpring(0, SPRING);
    });
  const web = Platform.OS === "web";
  const gesture = web ? pan : pan.activateAfterLongPress(350);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: 1 + lift.value * 0.015 }],
    boxShadow: `0 ${8 * lift.value}px ${24 * lift.value}px rgba(0,0,0,${0.28 * lift.value})`,
  }));
  // The outer view is the sibling in the list, so it carries the stacking order.
  const outerStyle = useAnimatedStyle(() => ({ zIndex: lift.value > 0 || translateY.value !== 0 ? 10 : 0 }));

  const handle = (
    <View accessibilityLabel="Drag to reorder" style={[styles.handle, web && ({ cursor: "grab" } as object)]}>
      <SymbolView name={IconNames.dragHandle} size={15} tintColor={theme.lineStrong} />
    </View>
  );

  const row = (
    <Animated.View style={[styles.row, { backgroundColor: surface }, style]}>
      <View style={styles.content}>{children}</View>
      {web ? <GestureDetector gesture={gesture}>{handle}</GestureDetector> : null}
    </Animated.View>
  );

  return (
    <Animated.View
      layout={reduced ? undefined : LAYOUT}
      entering={reduced ? undefined : FadeIn.duration(MOTION_MS).easing(EASE_OUT)}
      exiting={reduced ? undefined : FadeOut.duration(140)}
      style={outerStyle}
    >
      <View ref={rowRef} collapsable={false}>
        {web ? row : <GestureDetector gesture={gesture}>{row}</GestureDetector>}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderRadius: 10, borderCurve: "continuous" },
  content: { flex: 1, minWidth: 0 },
  handle: { width: 28, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
});
