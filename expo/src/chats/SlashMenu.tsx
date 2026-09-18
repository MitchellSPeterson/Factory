import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SymbolView } from "expo-symbols";
import { useTheme } from "@/hooks/use-theme";
import { Colors } from "@/constants/theme";
import type { SlashItem } from "./composerSlash";

const icons = {
  command: { ios: "terminal", android: "terminal", web: "terminal" },
  skill: { ios: "person.crop.circle", android: "person", web: "person" },
} as const;

export function SlashMenu({
  visible,
  items,
  onSelect,
}: {
  visible: boolean;
  items: readonly SlashItem[];
  onSelect: (item: SlashItem) => void;
}) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  if (!visible) return null;
  const dark = theme.background === Colors.dark.background;
  const maxHeight = Math.min(320, Math.round(height * 0.42));
  return (
    <View
      style={[
        styles.card,
        {
          maxHeight,
          backgroundColor: dark ? "#2c2c2c" : "#ffffff",
          borderColor: theme.line,
        },
      ]}
    >
      <Text style={[styles.heading, { color: theme.textSecondary }]}>Commands</Text>
      <ScrollView keyboardShouldPersistTaps="handled">
        {items.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            No matching command or Skill.
          </Text>
        ) : (
          items.map((item) => {
            const skill = item.kind === "skill";
            return (
              <Pressable
                key={skill ? `skill:${item.id}` : item.id}
                accessibilityRole="button"
                accessibilityLabel={
                  skill
                    ? `Skill ${item.slug}. ${item.description}`
                    : `${item.name}. ${item.description}`
                }
                onPress={() => onSelect(item)}
                style={({ pressed }) => [
                  styles.row,
                  { backgroundColor: pressed ? theme.subtleHover : "transparent" },
                ]}
              >
                <View
                  style={[
                    styles.icon,
                    { backgroundColor: dark ? "rgba(255,255,255,0.08)" : "#f0f0f2" },
                  ]}
                >
                  <SymbolView
                    name={skill ? icons.skill : icons.command}
                    size={16}
                    tintColor={theme.text}
                  />
                </View>
                <View style={styles.copy}>
                  <Text numberOfLines={1} style={styles.titleLine}>
                    {skill ? (
                      <>
                        <Text style={{ color: theme.textSecondary, fontSize: 15, fontWeight: "600" }}>
                          skill:
                        </Text>
                        <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
                          {item.slug}
                        </Text>
                      </>
                    ) : (
                      <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
                        {item.name}
                      </Text>
                    )}
                    <Text style={{ color: theme.textSecondary, fontSize: 14, fontWeight: "400" }}>
                      {`  ${item.description}`}
                    </Text>
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    marginBottom: 8,
    flexGrow: 0,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0 12px 40px rgba(0,0,0,0.22)" },
      default: {},
    }),
  },
  heading: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1, minWidth: 0 },
  titleLine: { fontSize: 15 },
  empty: { fontSize: 13, lineHeight: 20, paddingHorizontal: 14, paddingBottom: 16 },
});
