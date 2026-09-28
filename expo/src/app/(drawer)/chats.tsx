import { useMutation, useQuery } from "@/lib/factory";
import { DrawerToggleButton } from "expo-router/drawer";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { SymbolView } from "expo-symbols";
import { Alert, BackHandler, Platform, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "panelui-native/components/button";
import { Dialog } from "panelui-native/components/dialog";
import { Fab } from "panelui-native/components/fab";
import { Menu } from "panelui-native/components/menu";
import { PencilIcon, TrashIcon } from "panelui-native/icons";
import { Text } from "panelui-native/primitives/text";
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
  const params = useLocalSearchParams<{ session?: string; new?: string; roadmapItem?: string }>();
  const sessions = useQuery(api.sessions.list);
  const removeSession = useMutation(api.sessions.remove);
  const { scope, projects, currentProject } = useProjectScope();
  const [draftProject, setDraftProject] = useState<Id<"projects"> | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [lastPanel, setLastPanel] = useState<Panel | null>(null);
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
    router.setParams({ session: id, new: undefined, roadmapItem: undefined });
  }
  function newChat() {
    setPanel(null);
    router.setParams({ session: undefined, new: "1", roadmapItem: undefined });
  }
  function closeChat() {
    setPanel(null);
    router.setParams({ session: undefined, new: undefined, roadmapItem: undefined });
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
  const menuItems: MenuItem[] = [
    ...(desktop
      ? []
      : ([
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
  ];
  useLayoutEffect(() => {
    navigation.setOptions({
      title: chatTitle,
      headerTitle:
        fullPanel === "terminal" || fullPanel === "files"
          ? () => (
              <View className="max-w-full items-center">
                <Text
                  numberOfLines={1}
                  ellipsizeMode="tail"
                  className="text-[17px] font-semibold text-foreground">
                  {chatTitle}
                </Text>
                {project?.name ? (
                  <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    className="mt-px text-xs text-muted-foreground">
                    {project.name}
                  </Text>
                ) : null}
              </View>
            )
          : () => (
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                className={
                  Platform.OS === "android"
                    ? "max-w-full shrink text-xl font-semibold text-foreground"
                    : "max-w-full shrink text-[17px] font-semibold text-foreground"
                }>
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
      headerRight: hasHeaderActions
        ? () => (
            <View className="mr-2 flex-row items-center gap-1">
              <View className={panel === "files" ? "rounded-xl bg-primary/15" : undefined}>
                <IconButton
                  icon="folder"
                  accessibilityLabel="Files"
                  disabled={!project}
                  onPress={() => togglePanel("files")}
                  style={{ backgroundColor: "transparent" }}
                />
              </View>
              {desktop &&
                ([
                  { id: "git", icon: "git", label: "Git" },
                  { id: "terminal", icon: "terminal", label: "Terminal" },
                  { id: "device", icon: "devices", label: "Device" },
                ] as const).map((item) => (
                  <View
                    key={item.id}
                    className={panel === item.id ? "rounded-xl bg-primary/15" : undefined}>
                    <IconButton
                      icon={item.icon}
                      accessibilityLabel={item.label}
                      disabled={item.id !== "device" && !project}
                      onPress={() => togglePanel(item.id)}
                      style={{ backgroundColor: "transparent" }}
                    />
                  </View>
                ))}
              {(!desktop || selected) && (
                <Menu>
                  <Menu.Trigger>
                    <IconButton
                      icon="more"
                      accessibilityLabel="More"
                      onPress={() => undefined}
                      style={{ backgroundColor: "transparent" }}
                    />
                  </Menu.Trigger>
                  <Menu.Content align="end" minWidth={220}>
                    {menuItems.map((item) => (
                      <Menu.Item
                        key={item.label}
                        variant={item.danger ? "destructive" : "default"}
                        disabled={item.disabled}
                        icon={
                          item.danger ? (
                            <TrashIcon size={16} />
                          ) : (
                            <SymbolView name={IconNames[item.icon]} size={16} />
                          )
                        }
                        onSelect={item.onPress}>
                        {item.label}
                      </Menu.Item>
                    ))}
                  </Menu.Content>
                </Menu>
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
    theme.text,
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
    <View className="min-h-0 flex-1 flex-row bg-background">
      {showList && (
        <View
          className={`min-h-0 border-r border-border ${wide ? "bg-surface" : "bg-background"}`}
          style={{ width: wide ? 290 : "100%", paddingBottom: insets.bottom }}>
          <ChatList
            selectedId={selected?.session._id}
            onOpen={open}
            onDelete={(id, title) => setClosing({ id, title })}
          />
          <Fab
            accessibilityLabel="New chat"
            icon={<PencilIcon size={22} />}
            placement="bottom-right"
            offset={insets.bottom + 16}
            onPress={newChat}
          />
        </View>
      )}
      {(wide || showingConversation) && (
        <View className="min-w-0 flex-1">
          {!selected && !currentProject && (
            <ScrollView
              horizontal
              className="max-h-16 grow-0"
              contentContainerClassName="gap-1 p-2">
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
          <View className="min-h-0 flex-1 flex-row">
            <View className={fullPanel && !sideBySide ? "hidden" : "min-w-0 flex-1"}>
              <Conversation
                key={selected?.session._id ?? `new-${projectId}`}
                sessionId={selected?.session._id ?? null}
                projectId={projectId}
                projectName={project?.name ?? ""}
                roadmapItemId={
                  !selected && creating
                    ? (params.roadmapItem as Id<"roadmapItems"> | undefined)
                    : undefined
                }
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
                className={`shrink-0 border-l border-border ${panel ? "flex" : "hidden"} ${sideBySide ? "" : "w-full"}`}
                style={sideBySide ? { width: 400 } : undefined}>
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
      <Dialog open={!!closing} onOpenChange={(next) => { if (!next) setClosing(null); }}>
        <Dialog.Content className="w-full max-w-[360px] gap-2">
          <Dialog.Title>Delete {closing?.title}?</Dialog.Title>
          <Dialog.Description>This deletes the conversation and its messages.</Dialog.Description>
          <Dialog.Footer>
            <Button variant="ghost" onPress={() => setClosing(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onPress={() => {
                if (closing) void deleteChat(closing.id);
              }}>
              Delete chat
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
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
