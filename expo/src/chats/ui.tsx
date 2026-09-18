import { Pressable, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useTheme } from "@/hooks/use-theme";

const icons = {
  add: { ios: "plus", android: "add", web: "add" },
  send: { ios: "arrow.up", android: "arrow_upward", web: "arrow_upward" },
  terminal: { ios: "terminal", android: "terminal", web: "terminal" },
  git: {
    ios: "arrow.triangle.branch",
    android: "account_tree",
    web: "account_tree",
  },
  back: { ios: "chevron.left", android: "arrow_back", web: "arrow_back" },
  close: { ios: "xmark", android: "close", web: "close" },
  check: { ios: "checkmark", android: "check", web: "check" },
  refresh: { ios: "arrow.clockwise", android: "refresh", web: "refresh" },
  attach: { ios: "paperclip", android: "attach_file", web: "attach_file" },
  stop: { ios: "stop.fill", android: "stop", web: "stop" },
  down: { ios: "chevron.down", android: "expand_more", web: "expand_more" },
  copy: { ios: "doc.on.doc", android: "content_copy", web: "content_copy" },
} as const;
export function Action({
  icon,
  label,
  onPress,
  disabled,
  selected,
  compact,
  emphasis,
}: {
  icon?: keyof typeof icons;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  compact?: boolean;
  emphasis?: boolean;
}) {
  const theme = useTheme();
  const fill = emphasis
    ? disabled
      ? theme.lineStrong
      : theme.text
    : selected
      ? theme.backgroundSelected
      : "transparent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        emphasis && styles.emphasis,
        {
          backgroundColor:
            !emphasis && pressed && !disabled ? theme.subtleHover : fill,
          opacity: disabled && !emphasis ? 0.4 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        },
      ]}
    >
      {icon && (
        <SymbolView
          name={icons[icon]}
          size={emphasis ? 16 : 18}
          tintColor={
            emphasis
              ? disabled
                ? theme.textSecondary
                : theme.background
              : selected
                ? theme.accent
                : theme.text
          }
        />
      )}
      {!compact && (
        <Text
          style={{
            color: selected ? theme.accent : theme.text,
            fontSize: 13,
            fontWeight: "500",
          }}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}
export function Notice({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.notice}>
      <Text
        accessibilityRole={error ? "alert" : undefined}
        selectable
        style={{
          color: error ? theme.danger : theme.textSecondary,
          fontSize: 13,
          lineHeight: 20,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  action: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  emphasis: {
    width: 36,
    height: 36,
    minHeight: 36,
    minWidth: 36,
    paddingHorizontal: 0,
    borderRadius: 18,
  },
  notice: { paddingHorizontal: 16, paddingVertical: 10 },
});
