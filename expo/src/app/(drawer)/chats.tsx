import { useQuery } from "convex/react";
import { DrawerToggleButton } from "expo-router/drawer";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
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
import { TerminalPanel } from "@/chats/TerminalPanel";
import { IconButton, IconNames } from "@/components/icon-button";

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
  const inChat = showingConversation && !wide;
  const projectId =
    selected?.session.projectId ?? currentProject?._id ?? draftProject;
  const project = projects?.find((item) => item._id === projectId);
  const showList = wide || !showingConversation;
  function open(id: Id<"sessions">) {
    setPanel(null);
    router.setParams({ session: id, new: undefined });
  }
  function newChat() {
    setPanel(null);
    router.setParams({ session: undefined, new: "1" });
  }
  function closeChat() {
    setPanel(null);
    router.setParams({ session: undefined, new: undefined });
  }
  function onBack() {
    if (panel) {
      setPanel(null);
      return;
    }
    closeChat();
  }
  useLayoutEffect(() => {
    navigation.setOptions({
      title: panel === "terminal" ? "Terminal" : selected?.session.title ?? (creating ? "New chat" : "Chats"),
      headerTitle:
        panel === "terminal"
          ? () => (
              <View style={styles.terminalTitle}>
                <Text style={[styles.terminalHeading, { color: theme.text }]}>
                  Terminal
                </Text>
                {project?.name ? (
                  <Text
                    numberOfLines={1}
                    style={[styles.terminalSub, { color: theme.textSecondary }]}
                  >
                    {project.name}
                  </Text>
                ) : null}
              </View>
            )
          : undefined,
      headerLeft: inChat
        ? () => (
            <IconButton
              icon="back"
              accessibilityLabel={
                panel === "terminal"
                  ? "Close terminal"
                  : panel === "git"
                    ? "Close changes"
                    : "All chats"
              }
              onPress={onBack}
              style={{ backgroundColor: "transparent" }}
            />
          )
        : () => <DrawerToggleButton tintColor={theme.text} />,
      headerRight:
        wide || showingConversation
          ? () => (
              <View style={styles.headerRight}>
                <IconButton
                  icon="git"
                  accessibilityLabel="Changes"
                  disabled={!project}
                  onPress={() => togglePanel("git")}
                  style={
                    panel === "git"
                      ? { backgroundColor: theme.backgroundSelected }
                      : undefined
                  }
                />
                <IconButton
                  icon="terminal"
                  accessibilityLabel="Terminal"
                  disabled={!project}
                  onPress={() => togglePanel("terminal")}
                  style={
                    panel === "terminal"
                      ? { backgroundColor: theme.backgroundSelected }
                      : undefined
                  }
                />
              </View>
            )
          : () => null,
    });
  }, [
    inChat,
    navigation,
    panel,
    project,
    creating,
    selected?.session.title,
    project?.name,
    showingConversation,
    theme.backgroundSelected,
    theme.text,
    theme.textSecondary,
    wide,
  ]);
  useEffect(() => {
    if (!inChat) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [inChat, panel]);
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.background },
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
              paddingBottom: insets.bottom,
            },
          ]}
        >
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
                    {row.session.provider === "codex"
                      ? "Codex"
                      : row.session.provider === "cursor"
                        ? "Cursor"
                        : "Grok"}{" "}
                    · {row.session.status}
                  </Text>
                </Pressable>
              ))
            )}
          </ScrollView>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New chat"
            onPress={newChat}
            style={({ pressed }) => [
              styles.fab,
              {
                backgroundColor: theme.text,
                bottom: insets.bottom + 16,
              },
              pressed && styles.fabPressed,
            ]}
          >
            <SymbolView
              name={IconNames.compose}
              size={22}
              tintColor={theme.sidebar}
            />
          </Pressable>
        </View>
      )}
      {(wide || showingConversation) && (
        <View style={styles.main}>
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
                    flexShrink: 0,
                    display: panel ? "flex" : "none",
                    borderColor: theme.line,
                  },
                ]}
              >
                {lastPanel === "git" ? (
                  <ProjectTools
                    key={project._id}
                    projectId={project._id}
                    visible={panel !== null}
                    onClose={() => setPanel(null)}
                  />
                ) : (
                  <TerminalPanel
                    key={project._id}
                    projectId={project._id}
                    projectName={project.name}
                    visible={panel === "terminal"}
                  />
                )}
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
  search: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 16,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 13,
  },
  list: { paddingHorizontal: 8, paddingBottom: 88, gap: 4 },
  listEmpty: { padding: 16, gap: 8 },
  row: { padding: 14, borderRadius: 12, gap: 8 },
  rowHeading: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  rowTitle: { fontSize: 14, fontWeight: "500", flex: 1, lineHeight: 20 },
  metadata: { fontSize: 11, paddingLeft: 13 },
  main: { flex: 1, minWidth: 0 },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginRight: 8,
  },
  fab: {
    position: "absolute",
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
  fabPressed: { transform: [{ scale: 0.97 }] },
  work: { flex: 1, flexDirection: "row", minHeight: 0 },
  tools: { borderLeftWidth: 1 },
  projects: { flexGrow: 0, maxHeight: 64 },
  projectOptions: { padding: 8, gap: 4 },
  terminalTitle: { alignItems: "center" },
  terminalHeading: { fontSize: 17, fontWeight: "600" },
  terminalSub: { fontSize: 12, marginTop: 1 },
});
