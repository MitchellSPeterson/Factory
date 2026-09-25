import { useMutation, useQuery } from "@/lib/factory";
import { DrawerToggleButton } from "expo-router/drawer";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Id } from "@/lib/dataModel";
import { api } from "@/lib/api";
import { inProjectScope } from "@/lib/project-scope";
import { useProjectScope } from "@/lib/project-scope-context";
import { useTheme } from "@/hooks/use-theme";
import { Action } from "@/chats/ui";
import { Conversation } from "@/chats/Conversation";
import { chatHeaderTitleMaxWidth } from "@/chats/headerTitleLayout";
import { TerminalPanel } from "@/chats/TerminalPanel";
import { FilesPanel } from "@/chats/FilesPanel";
import { GitSheet } from "@/git/GitSheet";
import { IconButton, IconNames, type IconName } from "@/components/icon-button";
import { ChatList } from "@/chats/ChatList";
import { ToolPanel, type ToolTab } from "@/chats/ToolPanel";
import { useDesktop } from "@/hooks/use-desktop";

export default function ChatsPage() {
  const theme = useTheme();
  const navigation = useNavigation();
  const router = useRouter();
  const params = useLocalSearchParams<{ session?: string; new?: string }>();
  const sessions = useQuery(api.sessions.list);
  const removeSession = useMutation(api.sessions.remove);
  const { scope, projects, currentProject } = useProjectScope();
  const [draftProject, setDraftProject] = useState<Id<"projects"> | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [lastPanel, setLastPanel] = useState<Panel | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number } | null>(null);
  const moreRef = useRef<View>(null);
  function openMenu() {
    // Anchor under the ⋮ button wherever the header actually put it.
    moreRef.current?.measureInWindow((x, y, w, h) =>
      setMenuAnchor({ top: y + h + 4, right: Math.max(8, width - (x + w)) }),
    );
  }
  const [gitOpen, setGitOpen] = useState(false);
  const [closing, setClosing] = useState<{
    id: Id<"sessions">;
    title: string;
  } | null>(null);
  function togglePanel(next: Panel) {
    setLastPanel(next);
    setPanel(panel === next ? null : next);
  }
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 1000;
  const desktop = useDesktop();
  const sideBySide = width >= 1280;
  const scoped = useMemo(
    () =>
      (sessions ?? []).filter((row) =>
        inProjectScope(row.session.projectId, scope),
      ),
    [sessions, scope],
  );
  const selected = scoped.find((row) => row.session._id === params.session);
  const creating = params.new === "1";
  const showingConversation = !!selected || creating;
  const inChat = showingConversation && !wide;
  const projectId =
    selected?.session.projectId ?? currentProject?._id ?? draftProject;
  const project = projects?.find((item) => item._id === projectId);
  const showList = desktop ? false : wide || !showingConversation;
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
  const trailingActionCount = hasHeaderActions ? 2 : 0;
  const titleMaxWidth = chatHeaderTitleMaxWidth({
    windowWidth: width,
    insetStart: insets.left,
    insetEnd: insets.right,
    trailingActionCount,
    centered: process.env.EXPO_OS === "ios",
  });
  // Desktop keeps the chat title; its panel sits beside the chat instead of replacing it.
  const fullPanel = desktop ? null : panel;
  const chatTitle =
    fullPanel === "terminal"
      ? "Terminal"
      : fullPanel === "files"
        ? "Files"
        : selected?.session.title ?? (creating ? "New chat" : "Chats");
  useLayoutEffect(() => {
    navigation.setOptions({
      title: chatTitle,
      headerTitle:
        fullPanel === "terminal" || fullPanel === "files"
          ? () => (
              <View style={styles.terminalTitle}>
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  style={[styles.terminalHeading, { color: theme.text }]}
                >
                  {chatTitle}
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
                  : panel === "files"
                      ? "Close files"
                      : "All chats"
              }
              onPress={onBack}
              style={{ backgroundColor: "transparent" }}
            />
          )
        : desktop
          ? () => null
          : () => <DrawerToggleButton tintColor={theme.text} />,
      headerRight:
        hasHeaderActions
          ? () => (
              <View style={styles.headerRight}>
                <IconButton
                  icon="folder"
                  accessibilityLabel="Files"
                  disabled={!project}
                  onPress={() => togglePanel("files")}
                  style={
                    panel === "files"
                      ? { backgroundColor: theme.backgroundSelected }
                      : { backgroundColor: "transparent" }
                  }
                />
                {desktop &&
                  ([
                    { id: "git", icon: "git", label: "Git" },
                    { id: "terminal", icon: "terminal", label: "Terminal" },
                    { id: "device", icon: "devices", label: "Device" },
                  ] as const).map((item) => (
                    <IconButton
                      key={item.id}
                      icon={item.icon}
                      accessibilityLabel={item.label}
                      disabled={item.id !== "device" && !project}
                      onPress={() => togglePanel(item.id)}
                      style={
                        panel === item.id
                          ? { backgroundColor: theme.backgroundSelected }
                          : { backgroundColor: "transparent" }
                      }
                    />
                  ))}
                {(!desktop || selected) && (
                <View ref={moreRef} collapsable={false}>
                  <IconButton
                    icon="more"
                    accessibilityLabel="More"
                    onPress={openMenu}
                    style={
                      panel === "terminal" && !desktop
                        ? { backgroundColor: theme.backgroundSelected }
                        : { backgroundColor: "transparent" }
                    }
                  />
                </View>
                )}
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
    desktop,
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
    if (!desktop || !panel) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPanel(null);
    }
    // Capture phase: RN-web TextInputs stop keydown from bubbling.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [desktop, panel]);
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
          <ChatList
            selectedId={selected?.session._id}
            onOpen={open}
            onDelete={(id, title) => setClosing({ id, title })}
          />
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
                display: fullPanel && !sideBySide ? "none" : "flex",
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
            {desktop ? (
              <ToolPanel
                project={project}
                tab={lastPanel ?? "files"}
                open={!!panel}
              />
            ) : null}
            {!desktop && lastPanel && project && (
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
                {lastPanel === "files" ? (
                  <FilesPanel
                    key={project._id}
                    projectId={project._id}
                    projectName={project.name}
                    visible={panel === "files"}
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
      {project ? (
        <GitSheet project={project} visible={gitOpen} onClose={() => setGitOpen(false)} />
      ) : null}
      <HeaderMenu
        anchor={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        items={[
          // Desktop shows Terminal and Git as header buttons.
          ...(desktop ? [] : ([
          {
            label: panel === "terminal" ? "Close terminal" : "Open terminal",
            icon: "terminal",
            disabled: !project,
            onPress: () => togglePanel("terminal"),
          },
          {
            label: "Open git controls",
            icon: "git",
            disabled: !project,
            onPress: () => setGitOpen(true),
          },
          ] satisfies MenuItem[])),
          ...(selected
            ? [
                {
                  label: "Delete chat",
                  icon: "trash" as const,
                  danger: true,
                  onPress: () =>
                    setClosing({ id: selected.session._id, title: selected.session.title }),
                },
              ]
            : []),
        ]}
      />
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
type Panel = ToolTab;

type MenuItem = {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
};

/** Small anchored popover for the chat header's ⋮ button. */
function HeaderMenu({
  anchor,
  items,
  onClose,
}: {
  anchor: { top: number; right: number } | null;
  items: MenuItem[];
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal
      visible={!!anchor}
      transparent
      animationType="fade"
      // Full-window modal on Android so measured window coordinates line up.
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable accessibilityLabel="Close menu" onPress={onClose} style={StyleSheet.absoluteFill} />
      <View
        accessibilityRole="menu"
        style={[
          styles.menu,
          { top: anchor?.top ?? 0, right: anchor?.right ?? 12, backgroundColor: theme.backgroundElement, borderColor: theme.line },
        ]}
      >
        {items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="menuitem"
            accessibilityState={{ disabled: !!item.disabled }}
            disabled={item.disabled}
            onPress={() => {
              onClose();
              item.onPress();
            }}
            style={({ pressed }) => [
              styles.menuItem,
              pressed && { backgroundColor: theme.subtleHover },
              item.disabled && { opacity: 0.4 },
            ]}
          >
            <SymbolView
              name={IconNames[item.icon]}
              size={18}
              tintColor={item.danger ? theme.danger : theme.text}
            />
            <Text style={[styles.menuLabel, { color: item.danger ? theme.danger : theme.text }]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    minWidth: 220,
    paddingVertical: 6,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 46,
    paddingHorizontal: 16,
  },
  menuLabel: { fontSize: 16 },
  root: { flex: 1, flexDirection: "row", minHeight: 0 },
  listPane: { borderRightWidth: 1 },
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
