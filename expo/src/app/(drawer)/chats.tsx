import { useMutation, useQuery } from "convex/react";
import { DrawerToggleButton } from "expo-router/drawer";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  css,
  cubicBezier,
  useReducedMotion,
} from "react-native-reanimated";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "@/lib/api";
import { inProjectScope } from "@/lib/project-scope";
import { useProjectScope } from "@/lib/project-scope-context";
import { useTheme } from "@/hooks/use-theme";
import { Action } from "@/chats/ui";
import { Conversation } from "@/chats/Conversation";
import { chatHeaderTitleMaxWidth } from "@/chats/headerTitleLayout";
import { ProviderMark } from "@/chats/model-picker";
import { ProjectTools } from "@/chats/ProjectTools";
import { TerminalPanel } from "@/chats/TerminalPanel";
import { IconButton, IconNames } from "@/components/icon-button";

const pulse = css.keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.55 },
});
const motion = css.create({
  pulse: {
    animationName: pulse,
    animationDuration: "1.6s",
    animationTimingFunction: cubicBezier(0.77, 0, 0.175, 1),
    animationIterationCount: "infinite",
  },
});

function StatusDot({ color, running }: { color: string; running: boolean }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: color },
        running && !reduced ? motion.pulse : null,
      ]}
    />
  );
}

function ChatRow({
  title,
  projectName,
  provider,
  status,
  selected,
  statusColor,
  onOpen,
  onDelete,
}: {
  title: string;
  projectName?: string;
  provider: "codex" | "cursor" | "grok";
  status: string;
  selected: boolean;
  statusColor: string;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}${projectName ? `, ${projectName}` : ""}, ${status}`}
      accessibilityHint="Hold to delete"
      accessibilityActions={[{ name: "delete", label: "Delete" }]}
      accessibilityState={{ selected }}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === "delete") onDelete();
      }}
      onPress={onOpen}
      onLongPress={onDelete}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected
            ? theme.backgroundSelected
            : pressed
              ? theme.subtleHover
              : "transparent",
        },
      ]}
    >
      <View style={styles.rowBody}>
        <ProviderMark provider={provider} size={18} />
        <View style={styles.rowCopy}>
          <Text
            numberOfLines={2}
            style={[styles.rowTitle, { color: theme.text }]}
          >
            {title}
          </Text>
          {projectName ? (
            <Text
              numberOfLines={1}
              style={[styles.projectName, { color: theme.textSecondary }]}
            >
              {projectName}
            </Text>
          ) : null}
        </View>
        <StatusDot color={statusColor} running={status === "running"} />
      </View>
    </Pressable>
  );
}

export default function ChatsPage() {
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{ session?: string; new?: string }>();
  const sessions = useQuery(api.sessions.list);
  const removeSession = useMutation(api.sessions.remove);
  const { scope, projects, currentProject } = useProjectScope();
  const [search, setSearch] = useState("");
  const [draftProject, setDraftProject] = useState<Id<"projects"> | null>(null);
  const [panel, setPanel] = useState<"git" | "terminal" | null>(null);
  const [lastPanel, setLastPanel] = useState<"git" | "terminal" | null>(null);
  const [closing, setClosing] = useState<{
    id: Id<"sessions">;
    title: string;
  } | null>(null);
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
  async function deleteChat(id: Id<"sessions">) {
    try {
      await removeSession({ sessionId: id });
      setClosing(null);
      if (params.session === id) closeChat();
    } catch (e) {
      setClosing(null);
      Alert.alert(
        "Could not delete chat",
        e instanceof Error ? e.message : "Try again.",
      );
    }
  }
  function onBack() {
    if (panel) {
      setPanel(null);
      return;
    }
    closeChat();
  }
  const hasHeaderActions = wide || showingConversation;
  const trailingActionCount = hasHeaderActions ? (selected ? 3 : 2) : 0;
  const titleMaxWidth = chatHeaderTitleMaxWidth({
    windowWidth: width,
    insetStart: insets.left,
    insetEnd: insets.right,
    trailingActionCount,
    centered: process.env.EXPO_OS === "ios",
  });
  const chatTitle =
    panel === "terminal"
      ? "Terminal"
      : selected?.session.title ?? (creating ? "New chat" : "Chats");
  useLayoutEffect(() => {
    navigation.setOptions({
      title: chatTitle,
      headerTitle:
        panel === "terminal"
          ? () => (
              <View style={styles.terminalTitle}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[styles.terminalHeading, { color: theme.text }]}
                >
                  Terminal
                </Text>
                {project?.name ? (
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={[styles.terminalSub, { color: theme.textSecondary }]}
                  >
                    {project.name}
                  </Text>
                ) : null}
              </View>
            )
          : () => (
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={[styles.headerTitle, { color: theme.text }]}
              >
                {chatTitle}
              </Text>
            ),
      headerTitleContainerStyle: {
        maxWidth: titleMaxWidth,
        minWidth: 0,
        flexShrink: 1,
        overflow: "hidden",
      },
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
        hasHeaderActions
          ? () => (
              <View style={styles.headerRight}>
                {selected ? (
                  <IconButton
                    icon="trash"
                    accessibilityLabel="Delete chat"
                    onPress={() =>
                      setClosing({
                        id: selected.session._id,
                        title: selected.session.title,
                      })
                    }
                    style={{ backgroundColor: "transparent" }}
                  />
                ) : null}
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
    hasHeaderActions,
    inChat,
    navigation,
    panel,
    project,
    selected,
    chatTitle,
    creating,
    selected?.session.title,
    project?.name,
    showingConversation,
    theme.backgroundSelected,
    theme.text,
    theme.textSecondary,
    titleMaxWidth,
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
                <ChatRow
                  key={row.session._id}
                  title={row.session.title}
                  provider={row.session.provider}
                  projectName={
                    scope.kind === "viewAll" ? row.projectName : undefined
                  }
                  status={row.session.status}
                  selected={row.session._id === selected?.session._id}
                  statusColor={
                    row.session.status === "running" ||
                    row.session.status === "queued"
                      ? theme.accent
                      : row.session.status === "failed"
                        ? theme.danger
                        : theme.textSecondary
                  }
                  onOpen={() => open(row.session._id)}
                  onDelete={() =>
                    setClosing({
                      id: row.session._id,
                      title: row.session.title,
                    })
                  }
                />
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
      <Modal
        visible={!!closing}
        transparent
        animationType="fade"
        onRequestClose={() => setClosing(null)}
      >
        <View style={styles.overlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            onPress={() => setClosing(null)}
            style={StyleSheet.absoluteFill}
          />
          <View
            style={[
              styles.dialog,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.line,
              },
            ]}
          >
            <Text style={[styles.dialogTitle, { color: theme.text }]}>
              Delete {closing?.title}?
            </Text>
            <Text style={[styles.dialogBody, { color: theme.textSecondary }]}>
              This deletes the conversation and its messages.
            </Text>
            <View style={styles.dialogActions}>
              <Action label="Cancel" onPress={() => setClosing(null)} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete chat"
                onPress={() => {
                  if (closing) void deleteChat(closing.id);
                }}
                style={({ pressed }) => [
                  styles.dialogDelete,
                  pressed && {
                    backgroundColor: theme.subtleHover,
                    transform: [{ scale: 0.97 }],
                  },
                ]}
              >
                <Text style={{ color: theme.danger, fontSize: 13, fontWeight: "500" }}>
                  Delete chat
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  row: { padding: 14, borderRadius: 12, borderCurve: "continuous" },
  rowBody: { flexDirection: "row", alignItems: "center", gap: 10 },
  rowCopy: { flex: 1, minWidth: 0, gap: 4 },
  rowTitle: { fontSize: 14, fontWeight: "500", lineHeight: 20 },
  projectName: { fontSize: 11 },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    padding: 16,
  },
  dialog: {
    width: 360,
    maxWidth: "100%",
    alignSelf: "center",
    padding: 20,
    gap: 8,
    borderWidth: 1,
    borderRadius: 16,
    borderCurve: "continuous",
  },
  dialogTitle: { fontSize: 17, fontWeight: "600" },
  dialogBody: { fontSize: 13, lineHeight: 20 },
  dialogActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 8,
    gap: 4,
  },
  dialogDelete: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  main: { flex: 1, minWidth: 0 },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: Platform.select({ ios: 17, android: 20, default: 18 }),
    fontWeight: "600",
    flexShrink: 1,
    maxWidth: "100%",
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
  terminalTitle: { alignItems: "center", maxWidth: "100%" },
  terminalHeading: { fontSize: 17, fontWeight: "600" },
  terminalSub: { fontSize: 12, marginTop: 1 },
});
