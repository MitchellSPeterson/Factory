import { useQuery } from "convex/react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "@/lib/api";
import { inProjectScope } from "@/lib/project-scope";
import { useProjectScope } from "@/lib/project-scope-context";
import { useTheme } from "@/hooks/use-theme";
import { Action } from "@/chats/ui";
import { Conversation } from "@/chats/Conversation";
import { ProjectTools } from "@/chats/ProjectTools";

export default function ChatsPage() {
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{ session?: string; new?: string }>();
  const sessions = useQuery(api.sessions.list);
  const { scope, projects, currentProject } = useProjectScope();
  const [search, setSearch] = useState("");
  const [draftProject, setDraftProject] = useState<Id<"projects"> | null>(null);
  const [panel, setPanel] = useState<"git" | "terminal" | null>(null);
  const [lastPanel, setLastPanel] = useState<"git" | "terminal" | null>(null);
  function togglePanel(next: "git" | "terminal") {
    setLastPanel(next);
    setPanel(panel === next ? null : next);
  }
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 1000;
  const sideBySide = width >= 1280;
  const scoped = useMemo(
    () =>
      (sessions ?? []).filter((row) =>
        inProjectScope(row.session.projectId, scope),
      ),
    [sessions, scope],
  );
  const filtered = scoped.filter((row) =>
    `${row.session.title} ${row.projectName}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const selected = scoped.find((row) => row.session._id === params.session);
  const creating = params.new === "1";
  const showingConversation = !!selected || creating;
  const projectId =
    selected?.session.projectId ?? currentProject?._id ?? draftProject;
  const project = projects?.find((item) => item._id === projectId);
  const showList = wide || !showingConversation;
  useLayoutEffect(() => {
    navigation.setOptions({ title: selected?.session.title ?? "Chats" });
  }, [navigation, selected?.session.title]);
  function open(id: Id<"sessions">) {
    setPanel(null);
    router.setParams({ session: id, new: undefined });
  }
  function newChat() {
    setPanel(null);
    router.setParams({ session: undefined, new: "1" });
  }
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.background, paddingBottom: insets.bottom },
      ]}
    >
      {showList && (
        <View
          style={[
            styles.listPane,
            {
              width: wide ? 290 : "100%",
              borderColor: theme.line,
              backgroundColor: wide ? theme.sidebar : theme.background,
            },
          ]}
        >
          <View style={styles.listHeader}>
            <Text style={[styles.heading, { color: theme.text }]}>Chats</Text>
            <Action icon="add" label="New chat" compact onPress={newChat} />
          </View>
          <TextInput
            accessibilityLabel="Search chats"
            placeholder="Search conversations…"
            placeholderTextColor={theme.textSecondary}
            value={search}
            onChangeText={setSearch}
            style={[
              styles.search,
              {
                backgroundColor: theme.backgroundElement,
                color: theme.text,
                borderColor: theme.line,
              },
            ]}
          />
          <ScrollView
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
          >
            {sessions === undefined ? (
              <ActivityIndicator color={theme.accent} />
            ) : !filtered.length ? (
              <View style={styles.listEmpty}>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 14,
                    lineHeight: 22,
                  }}
                >
                  {search
                    ? "No conversations match your search."
                    : "Start a conversation to work with an agent in a Project."}
                </Text>
                {!search && (
                  <Action
                    icon="add"
                    label="New chat"
                    selected
                    onPress={newChat}
                  />
                )}
              </View>
            ) : (
              filtered.map((row) => (
                <Pressable
                  key={row.session._id}
                  accessibilityRole="button"
                  accessibilityState={{
                    selected: row.session._id === selected?.session._id,
                  }}
                  onPress={() => open(row.session._id)}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor:
                        row.session._id === selected?.session._id
                          ? theme.backgroundSelected
                          : pressed
                            ? theme.subtleHover
                            : "transparent",
                    },
                  ]}
                >
                  <View style={styles.rowHeading}>
                    <View
                      style={[
                        styles.dot,
                        {
                          backgroundColor:
                            row.session.status === "running" ||
                            row.session.status === "queued"
                              ? theme.accent
                              : row.session.status === "failed"
                                ? theme.danger
                                : theme.textSecondary,
                        },
                      ]}
                    />
                    <Text
                      numberOfLines={2}
                      style={[styles.rowTitle, { color: theme.text }]}
                    >
                      {row.session.title}
                    </Text>
                  </View>
                  <Text
                    numberOfLines={1}
                    style={[styles.metadata, { color: theme.textSecondary }]}
                  >
                    {row.projectName} ·{" "}
                    {row.session.provider === "codex" ? "Codex" : "Grok"} ·{" "}
                    {row.session.status}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
        </View>
      )}
      {(wide || showingConversation) && (
        <View style={styles.main}>
          <View style={[styles.topbar, { borderColor: theme.line }]}>
            {!wide && (
              <Action
                icon="back"
                label="All chats"
                compact
                onPress={() => {
                  setPanel(null);
                  router.setParams({ session: undefined, new: undefined });
                }}
              />
            )}
            <View style={styles.projectLabel}>
              <Text
                numberOfLines={1}
                style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}
              >
                {project?.name ?? "New conversation"}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
                {selected?.session.status === "running"
                  ? "Agent working"
                  : selected
                    ? selected.session.model
                    : "Local Project"}
              </Text>
            </View>
            <Action
              icon="git"
              label="Changes"
              compact={width < 460}
              selected={panel === "git"}
              disabled={!project}
              onPress={() => togglePanel("git")}
            />
            <Action
              icon="terminal"
              label="Terminal"
              compact={width < 460}
              selected={panel === "terminal"}
              disabled={!project}
              onPress={() => togglePanel("terminal")}
            />
          </View>
          {!selected && !currentProject && (
            <ScrollView
              horizontal
              style={styles.projects}
              contentContainerStyle={styles.projectOptions}
            >
              {projects?.map((item) => (
                <Action
                  key={item._id}
                  label={item.name}
                  selected={projectId === item._id}
                  onPress={() => setDraftProject(item._id)}
                />
              ))}
            </ScrollView>
          )}
          <View style={styles.work}>
            <View
              style={{
                flex: 1,
                minWidth: 0,
                display: panel && !sideBySide ? "none" : "flex",
              }}
            >
              <Conversation
                key={selected?.session._id ?? `new-${projectId}`}
                sessionId={selected?.session._id ?? null}
                projectId={projectId}
                projectName={project?.name ?? ""}
                onCreated={open}
              />
            </View>
            {lastPanel && project && (
              <View
                style={[
                  styles.tools,
                  {
                    width: sideBySide ? 400 : "100%",
                    display: panel ? "flex" : "none",
                    borderColor: theme.line,
                  },
                ]}
              >
                <ProjectTools
                  key={project._id}
                  projectId={project._id}
                  localPath={project.localPath}
                  panel={lastPanel}
                  visible={panel !== null}
                  onClose={() => setPanel(null)}
                />
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", minHeight: 0 },
  listPane: { borderRightWidth: 1 },
  listHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  heading: { fontSize: 22, fontWeight: "600", letterSpacing: -0.4 },
  search: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
  },
  list: { paddingHorizontal: 8, paddingBottom: 24, gap: 4 },
  listEmpty: { padding: 16, gap: 18 },
  row: { padding: 14, borderRadius: 12, gap: 8 },
  rowHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  rowTitle: { fontSize: 14, fontWeight: "500", flex: 1, lineHeight: 20 },
  metadata: { fontSize: 11, paddingLeft: 13 },
  main: { flex: 1, minWidth: 0 },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
    borderBottomWidth: 1,
  },
  projectLabel: { flex: 1, gap: 3, paddingLeft: 4, minWidth: 0 },
  work: { flex: 1, flexDirection: "row", minHeight: 0 },
  tools: { borderLeftWidth: 1 },
  projects: { flexGrow: 0, maxHeight: 64 },
  projectOptions: { padding: 8, gap: 4 },
});
