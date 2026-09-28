// Project-scoped list of Builds. Mirrors RoadmapList's shell (toolbar-less here — Builds only
// start from a Roadmap Item) with the same loading/empty/row conventions.
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useRouter } from "expo-router";
import { useQuery } from "@/lib/factory";
import { api } from "@/lib/api";
import type { Doc, Id } from "@/lib/dataModel";
import { useTheme } from "@/hooks/use-theme";
import { Action } from "@/chats/ui";
import { IconNames } from "@/components/icon-button";
import { BUILD_STATUS_LABEL, buildStatusColor } from "@/build/meta";

export function BuildList({
  projectId,
  selectedId,
  onOpen,
}: {
  projectId: Id<"projects">;
  selectedId: Id<"builds"> | undefined;
  onOpen: (id: Id<"builds">) => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const builds = useQuery(api.builds.list, { projectId });
  const sorted = [...(builds ?? [])].sort((a, b) => b._creationTime - a._creationTime);

  return (
    <View style={styles.root}>
      {builds === undefined ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.textSecondary} />
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.empty}>
          <View style={[styles.emptyMark, { backgroundColor: theme.backgroundSelected }]}>
            <SymbolView name={IconNames.loop} size={22} tintColor={theme.accent} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Builds yet</Text>
          <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
            Start one from a Roadmap Item: open the item and choose “Send to Build”.
          </Text>
          <Action label="Open Roadmap" emphasis onPress={() => router.push("/roadmap")} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {sorted.map((build) => (
            <BuildRow key={build._id} build={build} selected={selectedId === build._id} onOpen={() => onOpen(build._id)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function BuildRow({ build, selected, onOpen }: { build: Doc<"builds">; selected: boolean; onOpen: () => void }) {
  const theme = useTheme();
  const done = build.checkpoints.filter((c) => c.status === "done").length;
  const total = build.checkpoints.length;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${build.title}, ${BUILD_STATUS_LABEL[build.status]}`}
      accessibilityState={{ selected }}
      onPress={onOpen}
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        styles.row,
        selected ? { backgroundColor: theme.backgroundSelected } : (pressed || hovered) && { backgroundColor: theme.subtleHover },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: buildStatusColor(theme, build.status) }]} />
      <View style={styles.rowCopy}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: theme.text }]}>
          {build.title}
        </Text>
        <Text style={[styles.rowMeta, { color: theme.textSecondary }]}>
          {BUILD_STATUS_LABEL[build.status]}
          {total > 0 ? ` · ${done}/${total} Checkpoints` : ""}
        </Text>
      </View>
      <SymbolView name={IconNames.chevronRight} size={11} tintColor={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 6, paddingBottom: 40 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderCurve: "continuous",
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowCopy: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: "500" },
  rowMeta: { fontSize: 12, fontVariant: ["tabular-nums"] },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 10 },
  emptyMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 17, fontWeight: "600" },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 280 },
});
