import { useEffect, useState, type ReactNode } from "react";
import { AccessibilityInfo, AppState, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const SHIMMER_WIDTH = 72;
const SHIMMER_SWEEP_MS = 1_350;
const SHIMMER_PAUSE_MS = 1_450;

export function ShimmeringWorkContent({
  children,
}: {
  children: (input: { highlighted: boolean }) => ReactNode;
}) {
  const reducedPref = useReducedMotion();
  const [availableWidth, setAvailableWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [appIsActive, setAppIsActive] = useState(AppState.currentState === "active");
  const [a11yReduced, setA11yReduced] = useState(false);
  const progress = useSharedValue(0);
  const reduced = reducedPref || a11yReduced;
  const sweepWidth = Math.min(availableWidth, Math.max(contentWidth, 1));

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppIsActive(state === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const sync = (value: boolean) => setA11yReduced(value);
    void AccessibilityInfo.isReduceMotionEnabled().then(sync);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", sync);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    cancelAnimation(progress);
    progress.set(0);
    if (sweepWidth <= 0 || reduced || !appIsActive) return;
    progress.set(
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: SHIMMER_SWEEP_MS,
            easing: Easing.linear,
            reduceMotion: ReduceMotion.Never,
          }),
          withDelay(
            SHIMMER_PAUSE_MS,
            withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never }),
          ),
        ),
        -1,
        false,
        undefined,
        ReduceMotion.Never,
      ),
    );
    return () => cancelAnimation(progress);
  }, [appIsActive, progress, reduced, sweepWidth]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: -SHIMMER_WIDTH + progress.get() * (sweepWidth + SHIMMER_WIDTH),
      },
    ],
  }));
  const counterSweepStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: SHIMMER_WIDTH - progress.get() * (sweepWidth + SHIMMER_WIDTH),
      },
    ],
  }));

  return (
    <View
      style={styles.clip}
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
    >
      <View
        onLayout={(event) => setContentWidth(event.nativeEvent.layout.width)}
        style={styles.fit}
      >
        {children({ highlighted: false })}
      </View>
      {!reduced && appIsActive && sweepWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[styles.sweep, sweepStyle]}
        >
          <Animated.View style={[{ width: availableWidth }, counterSweepStyle]}>
            {children({ highlighted: true })}
          </Animated.View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    minWidth: 0,
    flex: 1,
    overflow: "hidden",
  },
  fit: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
  },
  sweep: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: SHIMMER_WIDTH,
    overflow: "hidden",
  },
});
