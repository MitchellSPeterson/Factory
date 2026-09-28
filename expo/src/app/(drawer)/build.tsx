import { useLayoutEffect } from "react";
import { DrawerToggleButton } from "expo-router/drawer";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { SymbolView } from "expo-symbols";
import Animated, { FadeIn, useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronRightIcon } from "panelui-native/icons";
import { Text } from "panelui-native/primitives/text";
import type { Id } from "@/lib/dataModel";
import { useProjectScope } from "@/lib/project-scope-context";
import { useTheme } from "@/hooks/use-theme";
import { useDesktop } from "@/hooks/use-desktop";
import { EmptyState } from "@/components/empty-state";
import { IconButton, IconNames } from "@/components/icon-button";
import { Item } from "panelui-native/components/item";
import { ProjectPicture } from "@/components/project-picture";
import { BuildList } from "@/build/BuildList";
import { BuildDetail, BuildActionCard } from "@/build/BuildDetail";
import { EASE_OUT, MOTION_MS } from "@/roadmap/meta";

export default function BuildPage() {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{ build?: string }>();
  const { scope, setScope, projects, currentProject } = useProjectScope();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 1000;
  const desktop = useDesktop();
  const buildId = params.build as Id<"builds"> | undefined;
  const inBuild = !!buildId && !wide;

  function open(id: Id<"builds">) {
    router.setParams({ build: id });
  }
  function close() {
    router.setParams({ build: undefined });
  }

  useLayoutEffect(() => {
    navigation.setOptions({
      title: currentProject ? `${currentProject.name} Builds` : "Builds",
      headerLeft: inBuild
        ? () => <IconButton icon="back" accessibilityLabel="All Builds" onPress={close} style={{ backgroundColor: "transparent" }} />
        : desktop
          ? () => null
          : () => <DrawerToggleButton tintColor={theme.text} />,
    });
  }, [inBuild, navigation, desktop, theme.text, currentProject?.name]);

  if (scope.kind === "viewAll") {
    return (
      <View className="min-h-0 flex-1 flex-row bg-background">
        <Animated.View entering={reduced ? undefined : FadeIn.duration(MOTION_MS).easing(EASE_OUT)} style={{ flex: 1 }}>
        <View className="flex-1 items-center justify-center gap-2 p-6">
          <View className="mb-1.5 h-12 w-12 items-center justify-center rounded-[14px] bg-primary/15">
            <SymbolView name={IconNames.loop} size={22} tintColor={theme.accent} />
          </View>
          <Text className="text-center text-[17px] font-semibold text-foreground">Each Project has its own Builds</Text>
          <Text className="text-center text-[13px] text-muted-foreground">Choose one to see what's running.</Text>
          <ScrollView className="mt-3 max-h-[360px] w-[340] max-w-full grow-0 rounded-xl border border-border" contentContainerClassName="p-1">
            <Item.Group>
              {projects?.map((project) => (
                <Item
                  key={project._id}
                  accessibilityRole="button"
                  onPress={() => setScope({ kind: "project", projectId: project._id })}>
                  <Item.Media>
                    <ProjectPicture githubRepo={project.githubRepo} name={project.name} size={24} />
                  </Item.Media>
                  <Item.Content>
                    <Item.Title numberOfLines={1}>{project.name}</Item.Title>
                  </Item.Content>
                  <Item.Actions>
                    <ChevronRightIcon size={14} className="text-muted-foreground" />
                  </Item.Actions>
                </Item>
              ))}
            </Item.Group>
          </ScrollView>
        </View>
        </Animated.View>
      </View>
    );
  }

  if (!currentProject) return <View className="min-h-0 flex-1 flex-row bg-background" />;

  return (
    <View className="min-h-0 flex-1 flex-row bg-background">
      {(wide || !buildId) && (
        <View
          className={`min-h-0 border-border ${wide ? "border-r bg-surface" : "flex-1 bg-background"}`}
          style={[{ paddingBottom: insets.bottom }, wide ? { width: 360 } : null]}>
          <BuildList key={currentProject._id} projectId={currentProject._id} selectedId={buildId} onOpen={open} />
        </View>
      )}
      {(wide || buildId) && (
        <View className="min-w-0 flex-1" style={{ paddingBottom: insets.bottom }}>
          {buildId ? (
            <Animated.View key={buildId} entering={reduced ? undefined : FadeIn.duration(MOTION_MS).easing(EASE_OUT)} style={{ flex: 1, minWidth: 0 }}>
              <BuildDetail buildId={buildId} onClose={close} />
              <BuildActionCard buildId={buildId} />
            </Animated.View>
          ) : (
            <EmptyState title="Select a Build to see its details." body="" icon="loop" />
          )}
        </View>
      )}
    </View>
  );
}
