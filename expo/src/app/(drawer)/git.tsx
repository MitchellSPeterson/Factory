import { Drawer } from "expo-router/drawer";
import { View } from "react-native";
import { Spinner } from "panelui-native/components/spinner";
import { Text } from "panelui-native/primitives/text";
import { useProjectScope } from "@/lib/project-scope-context";
import { Notice } from "@/chats/ui";
import { ProjectSwitcher } from "@/components/project-switcher";
import { GitWorkspace } from "@/git/GitWorkspace";

export default function GitPage() {
  const { currentProject, projects } = useProjectScope();
  return (
    <View className="min-h-0 flex-1 bg-background">
      <Drawer.Screen options={{ title: "Git" }} />
      {!projects ? (
        <View className="flex-1 items-center justify-center">
          <Spinner label="Loading projects" />
        </View>
      ) : currentProject ? (
        <GitWorkspace key={currentProject._id} project={currentProject} />
      ) : (
        <View className="max-w-[460px] flex-1 items-center justify-center gap-3 self-center p-6">
          <Text className="text-base font-semibold text-foreground">Choose a Project</Text>
          <Notice text="Git shows this Project's branches, worktrees, and what is waiting to commit." />
          <ProjectSwitcher />
        </View>
      )}
    </View>
  );
}
