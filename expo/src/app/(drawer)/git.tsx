import { Drawer } from "expo-router/drawer";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useProjectScope } from "@/lib/project-scope-context";
import { useTheme } from "@/hooks/use-theme";
import { Notice } from "@/chats/ui";
import { ProjectSwitcher } from "@/components/project-switcher";
import { GitWorkspace } from "@/git/GitWorkspace";

export default function GitPage() {
  const { currentProject, projects } = useProjectScope();
  const theme = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Drawer.Screen options={{ title: "Git" }} />
      {!projects ? (
        <ActivityIndicator style={styles.empty} />
      ) : currentProject ? (
        <GitWorkspace key={currentProject._id} project={currentProject} />
      ) : (
        <View style={styles.empty}>
          <Text style={[styles.title, { color: theme.text }]}>
            Choose a Project
          </Text>
          <Notice text="Git shows this Project's branches, worktrees, and what is waiting to commit." />
          <ProjectSwitcher />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  title: { fontSize: 16, fontWeight: "600" },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignSelf: "center",
    padding: 24,
    maxWidth: 460,
    gap: 12,
  },
});
