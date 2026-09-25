// Anchored popover menu for Roadmap controls (⋯ menus, status picker). Mirrors the
// project switcher's menu: measured trigger, scale-and-fade entrance, Escape to close.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, { useReducedMotion, withTiming } from "react-native-reanimated";
import { Colors } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { IconNames, type IconName } from "@/components/icon-button";
import { EASE_OUT } from "./meta";

export type PopoverItem = {
  label: string;
  icon?: IconName;
  iconColor?: string;
  selected?: boolean;
  danger?: boolean;
  onPress: () => void;
};

type Rect = { x: number; y: number; w: number; h: number };

function entering() {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.96 }, { translateY: -4 }] },
    animations: {
      opacity: withTiming(1, { duration: 160, easing: EASE_OUT }),
      transform: [
        { scale: withTiming(1, { duration: 160, easing: EASE_OUT }) },
        { translateY: withTiming(0, { duration: 160, easing: EASE_OUT }) },
      ],
    },
  };
}

/** Wraps a trigger; `children` receives an `open` function to call from the trigger's onPress. */
export function Popover({
  items,
  align = "right",
  children,
}: {
  items: PopoverItem[];
  align?: "left" | "right";
  children: (open: () => void, isOpen: boolean) => ReactNode;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const trigger = useRef<View>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const dark = theme.background === Colors.dark.background;

  useEffect(() => {
    if (!rect || Platform.OS !== "web") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRect(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rect]);

  function open() {
    trigger.current?.measureInWindow((x, y, w, h) => setRect({ x, y, w, h }));
  }

  const below = rect ? rect.y + rect.h + 6 : 0;
  const flipUp = rect ? below + items.length * 44 + 16 > height : false;

  return (
    <>
      <View ref={trigger} collapsable={false}>
        {children(open, !!rect)}
      </View>
      <Modal
        visible={!!rect}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => setRect(null)}
      >
        <Pressable accessibilityLabel="Close menu" onPress={() => setRect(null)} style={StyleSheet.absoluteFill} />
        {rect ? (
          <Animated.View
            entering={reduced ? undefined : entering}
            accessibilityRole="menu"
            style={[
              styles.menu,
              {
                backgroundColor: dark ? "#2c2c2c" : "#ffffff",
                borderColor: theme.line,
                ...(align === "right"
                  ? { right: Math.max(8, width - (rect.x + rect.w)) }
                  : { left: Math.max(8, rect.x) }),
                ...(flipUp ? { bottom: height - rect.y + 6 } : { top: below }),
              },
            ]}
          >
            {items.map((item) => (
              <Pressable
                key={item.label}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: !!item.selected }}
                onPress={() => {
                  setRect(null);
                  item.onPress();
                }}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.item,
                  (pressed || hovered) && { backgroundColor: theme.subtleHover },
                ]}
              >
                {item.icon ? (
                  <SymbolView
                    name={IconNames[item.icon]}
                    size={16}
                    tintColor={item.danger ? theme.danger : (item.iconColor ?? theme.textSecondary)}
                  />
                ) : null}
                <Text style={[styles.label, { color: item.danger ? theme.danger : theme.text }]}>{item.label}</Text>
                {item.selected ? <SymbolView name={IconNames.check} size={14} tintColor={theme.accent} /> : null}
              </Pressable>
            ))}
          </Animated.View>
        ) : null}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    minWidth: 220,
    padding: 5,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 40,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderCurve: "continuous",
  },
  label: { flex: 1, fontSize: 14 },
});
