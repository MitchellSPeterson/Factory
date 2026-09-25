import { useLayoutEffect } from "react";
import { DrawerToggleButton } from "expo-router/drawer";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Id } from "@/lib/dataModel";
import { useProjectScope } from "@/lib/project-scope-context";
import { useTheme } from "@/hooks/use-theme";
import { useDesktop } from "@/hooks/use-desktop";
import { IconButton, IconNames } from "@/components/icon-button";
import { ProjectPicture } from "@/components/project-picture";
import { RoadmapList } from "@/roadmap/RoadmapList";
import { ItemDetail } from "@/roadmap/ItemDetail";
import { EASE_OUT, MOTION_MS } from "@/roadmap/meta";

export default function RoadmapPage() {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{ item?: string }>();
  const { scope, setScope, projects, currentProject } = useProjectScope();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 1000;
  const desktop = useDesktop();
  const itemId = params.item as Id<"roadmapItems"> | undefined;
  const inItem = !!itemId && !wide;

  function open(id: Id<"roadmapItems">) {
    router.setParams({ item: id });
  }
  function close() {
    router.setParams({ item: undefined });
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: currentProject ? `${currentProject.name} Roadmap` : "Roadmap",
      headerLeft: inItem
        ? () => <IconButton icon="back" accessibilityLabel="All items" onPress={close} style={{ backgroundColor: "transparent" }} />
        : desktop
          ? () => null
          : () => <DrawerToggleButton tintColor={theme.text} />,
    });
    // close is recreated each render but only calls setParams; re-run when its inputs change.
  }, [inItem, navigation, desktop, theme.text, currentProject?.name]);

  if (scope.kind === "viewAll") {
    return (
      <View style={[styles.root, { backgroundColor: theme.background }]}>
        <Animated.View entering={reduced ? undefined : FadeIn.duration(MOTION_MS).easing(EASE_OUT)} style={styles.pick}>
          <View style={[styles.pickMark, { backgroundColor: theme.backgroundSelected }]}>
            <SymbolView name={IconNames.layers} size={22} tintColor={theme.accent} />
          </View>
          <Text style={[styles.pickTitle, { color: theme.text }]}>Each Project has its own Roadmap</Text>
          <Text style={[styles.pickBody, { color: theme.textSecondary }]}>Choose one to plan its Features and Fixes.</Text>
          <ScrollView style={[styles.pickList, { borderColor: theme.line }]} contentContainerStyle={{ padding: 4 }}>
            {projects?.map((project) => (
              <Pressable
                key={project._id}
                accessibilityRole="button"
                onPress={() => setScope({ kind: "project", projectId: project._id })}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.pickRow,
                  (pressed || hovered) && { backgroundColor: theme.subtleHover },
                ]}
              >
                <ProjectPicture githubRepo={project.githubRepo} name={project.name} size={24} />
                <Text numberOfLines={1} style={[styles.pickName, { color: theme.text }]}>
                  {project.name}
                </Text>
                <SymbolView name={IconNames.chevronRight} size={11} tintColor={theme.textSecondary} />
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    );
  }

  if (!currentProject) return <View style={[styles.root, { backgroundColor: theme.background }]} />;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {(wide || !itemId) && (
        <View
          style={[
            styles.listPane,
            wide ? { width: 360, borderRightWidth: StyleSheet.hairlineWidth } : styles.fill,
            { borderColor: theme.line, backgroundColor: wide ? theme.sidebar : theme.background, paddingBottom: insets.bottom },
          ]}
        >
          <RoadmapList
            key={currentProject._id}
            projectId={currentProject._id}
            surface={wide ? theme.sidebar : theme.background}
            selectedId={itemId}
            onOpen={open}
          />
        </View>
      )}
      {(wide || itemId) && (
        <View style={[styles.fill, { paddingBottom: insets.bottom }]}>
          {itemId ? (
            <Animated.View
              key={itemId}
              entering={reduced ? undefined : FadeIn.duration(MOTION_MS).easing(EASE_OUT)}
              style={styles.fill}
            >
              <ItemDetail itemId={itemId} onClose={close} />
            </Animated.View>
          ) : (
            <View style={styles.noItem}>
              <SymbolView name={IconNames.layers} size={28} tintColor={theme.lineStrong} />
              <Text style={{ color: theme.textSecondary, fontSize: 14 }}>Select an item to see its details.</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", minHeight: 0 },
  fill: { flex: 1, minWidth: 0 },
  listPane: { minHeight: 0 },
  noItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  pick: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  pickMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  pickTitle: { fontSize: 17, fontWeight: "600", textAlign: "center" },
  pickBody: { fontSize: 13, textAlign: "center" },
  pickList: {
    flexGrow: 0,
    width: 340,
    maxWidth: "100%",
    maxHeight: 360,
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: "continuous",
  },
  pickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderCurve: "continuous",
  },
  pickName: { flex: 1, fontSize: 14, fontWeight: "500" },
});
