import { useMutation, useQuery } from "@/lib/factory";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import Markdown from "react-native-markdown-display";
import { readPickedAttachment } from "./pickedAttachment";
import * as Clipboard from "expo-clipboard";
import { api } from "@/lib/api";
import { withSkillMentions } from "../../../shared/sessionText";
import { dockedBottomPad } from "@/lib/keyboardInset";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import { useDesktop } from "@/hooks/use-desktop";
import { useTheme } from "@/hooks/use-theme";
import { Fonts, Colors } from "@/constants/theme";
import type { Id } from "@/lib/dataModel";
import { Action, Notice } from "./ui";
import { ActivityRow, ThinkingRow, WorkGroup } from "./ActivityRow";
import {
  groupChatFeed,
  hasPendingPermission,
  shouldShowThinkingRow,
} from "./activity";
import { readLastSettings, writeLastSettings } from "./lastSettingsStore";
import type { ChatSettings } from "./lastSettings";
import { canonicalCursorModel } from "../../../shared/agentModel";
import { roadmapPrompt } from "../../../shared/roadmap";
import { ModelMenu, PickerChip, effortLabel, modelTitle, useChatModels } from "./model-picker";
import { SlashMenu } from "./SlashMenu";
import { BranchPicker } from "./BranchPicker";
import { isCompactDraft, slashItems, slashQuery, type SlashItem } from "./composerSlash";
import {
  DEFAULT_PERMISSION_MODE,
  DEFAULT_SERVICE_TIER,
  type SessionItemKind,
} from "../../../shared/validators";
import type { SessionView as MailboxSessionView } from "../../../shared/dataModel";

type SessionView = MailboxSessionView & {
  session: MailboxSessionView["session"] & {
    provider: ChatSettings["provider"];
    effort: ChatSettings["effort"];
    permissionMode?: ChatSettings["permissionMode"];
    serviceTier?: ChatSettings["serviceTier"];
  };
};
type Message = SessionView["messages"][number] & {
  role: string;
  skillSlugs?: string[];
  kind?: SessionItemKind;
};
type Attachment = { id: Id<"_storage">; uri: string; name: string };
type PickedSkill = { slug: string; title: string };
type RepoSkill = { slug: string; title: string; description: string };
const MAX_CHAT_SKILLS = 8;

function labelsFor(
  slugs: string[] | undefined,
  catalog: readonly RepoSkill[],
): PickedSkill[] {
  if (!slugs?.length) return [];
  return slugs.map((slug) => {
    const skill = catalog.find((row) => row.slug === slug);
    return { slug, title: skill?.title ?? slug };
  });
}

function SkillChip({
  slug,
  onRemove,
}: {
  slug: string;
  onRemove?: () => void;
}) {
  const theme = useTheme();
  const chip = (
    <View
      style={[
        styles.skillChip,
        { backgroundColor: theme.subtleHover },
      ]}
    >
      <Text style={{ color: theme.textSecondary, fontSize: 13, fontWeight: "600" }}>
        skill:
        <Text style={{ color: theme.text }}>{slug}</Text>
        {onRemove ? (
          <Text style={{ color: theme.textSecondary, fontWeight: "500" }}>  ×</Text>
        ) : null}
      </Text>
    </View>
  );
  if (!onRemove) return chip;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Remove skill ${slug}`}
      onPress={onRemove}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {chip}
    </Pressable>
  );
}

function CopyPromptButton({ text, slugs }: { text: string; slugs: readonly string[] }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const payload = withSkillMentions(text, slugs);
  if (payload.trim() === "") return null;
  return (
    <Action
      icon={copied ? "check" : "copy"}
      label={copied ? "Copied prompt" : "Copy prompt"}
      compact
      onPress={() => {
        void Clipboard.setStringAsync(payload)
          .then((ok) => {
            if (!ok) return;
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}
    />
  );
}

function MessageRow({
  message,
  skills,
}: {
  message: Message;
  skills: PickedSkill[];
}) {
  const theme = useTheme();
  const user = message.role === "user";
  const dark = theme.background === Colors.dark.background;
  const bubble = (
    <View
      style={[
        styles.message,
        !user && styles.assistantMessage,
        user && styles.userMessage,
        user && {
          backgroundColor: dark ? "#2f2f2f" : "#ececee",
        },
      ]}
    >
      {skills.length > 0 ? (
        <View style={styles.skillRow}>
          {skills.map((skill) => (
            <SkillChip key={skill.slug} slug={skill.slug} />
          ))}
        </View>
      ) : null}
      {user ? (
        message.text ? (
          <Text selectable style={[styles.prose, { color: theme.text }]}>
            {message.text}
          </Text>
        ) : null
      ) : (
        <Markdown
          style={{
            body: { color: theme.text, fontSize: 16, lineHeight: 26 },
            code_inline: {
              backgroundColor: theme.backgroundElement,
              color: theme.text,
              fontFamily: Fonts.mono,
              fontSize: 13,
              borderWidth: 0,
              paddingHorizontal: 3,
              paddingVertical: 1,
            },
            fence: {
              backgroundColor: theme.sidebar,
              color: theme.text,
              borderColor: theme.line,
              fontFamily: Fonts.mono,
              fontSize: 12,
            },
            code_block: { backgroundColor: theme.sidebar, color: theme.text },
            link: { color: theme.accent },
            blockquote: {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.line,
            },
            hr: { backgroundColor: theme.line },
          }}
        >
          {message.text}
        </Markdown>
      )}
      {(message.imageUrls ?? [])
        .filter((url) => url !== null)
        .map((uri, i) => (
          <Image
            key={i}
            source={{ uri }}
            accessibilityLabel="Message attachment"
            style={styles.image}
            resizeMode="contain"
          />
        ))}
    </View>
  );
  if (!user) return bubble;
  return (
    <View style={styles.userWrap}>
      {bubble}
      <CopyPromptButton text={message.text} slugs={message.skillSlugs ?? []} />
    </View>
  );
}

export function Conversation({
  sessionId,
  projectId,
  projectName,
  roadmapItemId,
  onCreated,
}: {
  sessionId: Id<"sessions"> | null;
  projectId: Id<"projects"> | null;
  projectName: string;
  roadmapItemId?: Id<"roadmapItems"> | null;
  onCreated: (id: Id<"sessions">) => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const view = useQuery<SessionView | null>(api.sessions.get, sessionId ? { sessionId } : "skip");
  // New chat started from a Roadmap Item: load it once to pre-fill the composer (not auto-sent).
  const roadmapItem = useQuery(
    api.roadmap.getItem,
    !sessionId && roadmapItemId ? { itemId: roadmapItemId } : "skip",
  );
  const prefilledFor = useRef<string | null>(null);
  const create = useMutation(api.sessions.create);
  const send = useMutation(api.sessions.send);
  const stop = useMutation(api.sessions.stop);
  const configure = useMutation(api.sessions.configure);
  const uploadUrl = useMutation(api.sessions.generateUploadUrl);
  const project = useQuery(
    api.projects.get,
    projectId ? { projectId } : "skip",
  );
  const catalog = project?.skills ?? [];
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pickedSkills, setPickedSkills] = useState<PickedSkill[]>([]);
  const [picker, setPicker] = useState<null | "model" | "branch">(null);
  const [settings, setSettings] = useState<ChatSettings>(readLastSettings);
  const models = useChatModels();
  const currentModel = models?.find(
    (row) => row.provider === settings.provider && row.model === settings.model,
  );
  const editor = useRef<TextInput>(null);
  const desktop = useDesktop();
  const scroll = useRef<ScrollView>(null);
  const follow = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const busy =
    view?.session.status === "running" || view?.session.status === "queued";
  const awaitingApproval =
    view?.session.status === "running" && hasPendingPermission(view?.messages ?? []);
  const feed = useMemo(
    () => groupChatFeed(view?.messages ?? []),
    [view?.messages],
  );
  const showThinking = shouldShowThinkingRow({
    busy,
    queued: view?.session.status === "queued",
    awaitingApproval,
    messages: view?.messages ?? [],
  });
  useEffect(() => {
    if (view)
      setSettings({
        provider: view.session.provider,
        model:
          view.session.provider === "cursor"
            ? canonicalCursorModel(view.session.model)
            : view.session.model,
        effort: view.session.effort,
        permissionMode: view.session.permissionMode ?? DEFAULT_PERMISSION_MODE,
        serviceTier: view.session.serviceTier ?? DEFAULT_SERVICE_TIER,
      });
  }, [
    view?.session.provider,
    view?.session.model,
    view?.session.effort,
    view?.session.permissionMode,
    view?.session.serviceTier,
  ]);
  useEffect(() => {
    // New chats fall back to an available model when the saved one's provider is off or signed out.
    const first = models?.[0];
    if (sessionId || !first || currentModel) return;
    setSettings((prev) => ({ ...prev, provider: first.provider, model: first.model }));
  }, [sessionId, models, currentModel]);
  useEffect(() => {
    if (!roadmapItem || prefilledFor.current === roadmapItem._id) return;
    prefilledFor.current = roadmapItem._id;
    setText(roadmapPrompt(roadmapItem));
  }, [roadmapItem]);
  const query = slashQuery(text);
  const items = useMemo(() => {
    return slashItems(
      query ?? "",
      catalog.map((skill) => ({
        id: skill.slug,
        slug: skill.slug,
        title: skill.title,
        description: skill.description,
      })),
      { compact: !!sessionId && !busy },
    );
  }, [query, catalog, sessionId, busy]);
  const slashOpen = query !== null && picker !== "model";
  async function changeSettings(next: ChatSettings) {
    const previous = settings;
    setError("");
    setSettings(next);
    writeLastSettings(next);
    try {
      if (sessionId) await configure({ sessionId, ...next });
    } catch (e) {
      setSettings(previous);
      writeLastSettings(previous);
      setError(e instanceof Error ? e.message : "Could not update model.");
    }
  }
  async function submit(draft?: {
    text: string;
    imageIds: Id<"_storage">[];
    skillSlugs: string[];
  }) {
    const args = draft ?? {
      text: text.trim(),
      imageIds: attachments.map((item) => item.id),
      skillSlugs: pickedSkills.map((skill) => skill.slug),
    };
    if (
      (!args.text && !args.imageIds.length && !args.skillSlugs.length) ||
      pending ||
      busy ||
      !projectId
    )
      return;
    if (isCompactDraft(args.text) && !sessionId) {
      setError("Compact needs an existing conversation.");
      return;
    }
    setPicker(null);
    setPending(true);
    setError("");
    try {
      if (sessionId) await send({ sessionId, ...args });
      else
        onCreated(
          await create({
            projectId,
            ...settings,
            ...args,
            ...(roadmapItemId ? { roadmapItemId } : {}),
          }),
        );
      setText("");
      setAttachments([]);
      setPickedSkills([]);
      follow.current = true;
      setAtBottom(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message could not be sent.");
    } finally {
      setPending(false);
    }
  }
  function pickSlash(item: SlashItem) {
    if (item.kind === "command") {
      setText("");
      if (item.id === "compact") {
        void submit({ text: "/compact", imageIds: [], skillSlugs: [] });
        return;
      }
      setPicker("model");
      return;
    }
    const skill = catalog.find((row) => row.slug === item.slug);
    if (!skill) return;
    setText("");
    setPickedSkills((previous) => {
      if (previous.some((row) => row.slug === skill.slug)) return previous;
      if (previous.length >= MAX_CHAT_SKILLS) return previous;
      return [...previous, { slug: skill.slug, title: skill.title }];
    });
  }
  async function attach() {
    setUploading(true);
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        multiple: false,
        copyToCacheDirectory: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if ((asset.size ?? 0) > 10 * 1024 * 1024)
        throw new Error("Choose an image smaller than 10 MB.");
      const body = await readPickedAttachment(asset.uri, Platform.OS);
      const response = await fetch(await uploadUrl(), {
        method: "POST",
        headers: { "Content-Type": asset.mimeType ?? "image/png" },
        body,
      });
      if (!response.ok) throw new Error("Image upload failed. Try again.");
      const data: unknown = await response.json();
      if (
        !data ||
        typeof data !== "object" ||
        !("storageId" in data) ||
        typeof data.storageId !== "string"
      )
        throw new Error("Upload returned an invalid image ID.");
      setAttachments((previous) => [
        ...previous,
        {
          id: data.storageId as Id<"_storage">,
          uri: asset.uri,
          name: asset.name,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not attach image.");
    } finally {
      setUploading(false);
    }
  }
  if (sessionId && view === undefined)
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  if (sessionId && view === null)
    return (
      <Notice text="This conversation is no longer available. Choose another or start a new one." />
    );
  const bottomPad = dockedBottomPad({
    keyboardHeight: keyboard,
    insetBottom: insets.bottom,
    platform: Platform.OS,
    gap: Platform.OS === "ios" ? 16 : 8,
    webPad: 12,
  });
  return (
    <View style={[styles.root, { paddingBottom: bottomPad }]}>
      {view?.roadmapItem ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Roadmap item ${view.roadmapItem.title}`}
          onPress={() => router.push(`/roadmap?item=${view.roadmapItem!._id}`)}
          style={({ pressed }) => [
            styles.roadmapChip,
            { backgroundColor: theme.subtleHover, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text numberOfLines={1} style={{ color: theme.textSecondary, fontSize: 12, fontWeight: "600" }}>
            Roadmap · {view.roadmapItem.title}
          </Text>
        </Pressable>
      ) : null}
      <ScrollView
        ref={scroll}
        style={styles.feed}
        contentContainerStyle={[
          styles.feedContent,
          !view?.messages.length && styles.emptyFeed,
        ]}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={80}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            event.nativeEvent;
          const bottom =
            contentSize.height - contentOffset.y - layoutMeasurement.height <
            100;
          follow.current = bottom;
          setAtBottom(bottom);
        }}
        onContentSizeChange={() => {
          if (follow.current) scroll.current?.scrollToEnd({ animated: false });
        }}
      >
        {view?.messages.length ? (
          feed.map((row) => {
            if (row.type === "work") {
              return (
                <WorkGroup
                  key={row.id}
                  messages={row.messages}
                  live={busy && row.messages.some((message) => message.status === "inProgress" && message.kind === "tool")}
                  sessionLive={busy}
                />
              );
            }
            if (row.type === "permission") {
              return (
                <ActivityRow
                  key={row.message._id}
                  message={row.message}
                  sessionId={view.session._id}
                  canResolve={view.session.status === "running"}
                />
              );
            }
            return (
              <MessageRow
                key={row.message._id}
                message={row.message}
                skills={labelsFor(row.message.skillSlugs, catalog)}
              />
            );
          })
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              What are we building?
            </Text>
            <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
              {projectId
                ? `Ask ${projectName} anything.`
                : "Choose a Project to start."}
            </Text>
          </View>
        )}
        {view?.session.status === "queued" ? (
          <View style={styles.running}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              Waiting for this machine…
            </Text>
          </View>
        ) : null}
        {showThinking ? <ThinkingRow /> : null}
        {view?.session.error ? (
          <Notice text={view.session.error} error />
        ) : null}
      </ScrollView>
      {picker ? (
        <Pressable
          accessibilityLabel="Dismiss picker"
          onPress={() => setPicker(null)}
          style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        />
      ) : null}
      <View style={[styles.composerWrap, { zIndex: 2 }]}>
        {!atBottom && (
          <View style={styles.jump}>
            <Action
              icon="down"
              label="Latest message"
              selected
              onPress={() => {
                follow.current = true;
                setAtBottom(true);
                scroll.current?.scrollToEnd({ animated: true });
              }}
            />
          </View>
        )}
        {error ? <Notice text={error} error /> : null}
        <SlashMenu visible={slashOpen} items={items} onSelect={pickSlash} />
        <ModelMenu
          visible={picker === "model"}
          current={settings}
          disabled={busy}
          onChange={(next) => {
            void changeSettings(next);
          }}
        />
        {projectId && !sessionId ? (
          <BranchPicker
            projectId={projectId}
            open={picker === "branch"}
            onToggle={() => {
              if (picker !== "branch") editor.current?.blur();
              setPicker(picker === "branch" ? null : "branch");
            }}
            onClose={() => setPicker(null)}
          />
        ) : null}
        <View
          style={[
            styles.composer,
            {
              backgroundColor: theme.background === Colors.dark.background
                ? "#2f2f2f"
                : theme.backgroundElement,
              borderColor: theme.line,
            },
          ]}
        >
          {!!attachments.length && (
            <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
              {attachments.map((item) => (
                <View key={item.id}>
                  <Image source={{ uri: item.uri }} style={styles.thumbnail} />
                  <Action
                    icon="close"
                    label={`Remove ${item.name}`}
                    compact
                    onPress={() =>
                      setAttachments((previous) =>
                        previous.filter((image) => image.id !== item.id),
                      )
                    }
                  />
                </View>
              ))}
            </ScrollView>
          )}
          {pickedSkills.length > 0 ? (
            <View style={[styles.skillRow, { paddingHorizontal: 8, paddingTop: 8 }]}>
              {pickedSkills.map((skill) => (
                <SkillChip
                  key={skill.slug}
                  slug={skill.slug}
                  onRemove={() =>
                    setPickedSkills((previous) =>
                      previous.filter((row) => row.slug !== skill.slug),
                    )
                  }
                />
              ))}
            </View>
          ) : null}
          <TextInput
            ref={editor}
            accessibilityLabel="Message"
            placeholder={
              busy
                ? "Write your next message…"
                : "Ask anything, or type /"
            }
            placeholderTextColor={theme.textSecondary}
            value={text}
            onFocus={() => setPicker(null)}
            onChangeText={(next) => {
              if (slashQuery(next) !== null) setPicker(null);
              setText(next);
            }}
            multiline
            autoFocus={desktop}
            onKeyPress={(event) => {
              if (!desktop) return;
              // Desktop keyboard: Enter sends (or picks the top / item), ⇧Enter is a newline, ⌘/ opens models.
              const key = event.nativeEvent as unknown as KeyboardEvent;
              if (key.key === "Enter" && !key.shiftKey && !key.isComposing) {
                event.preventDefault();
                if (slashOpen && items[0]) pickSlash(items[0]);
                else void submit();
              } else if (key.key === "/" && (key.metaKey || key.ctrlKey)) {
                event.preventDefault();
                if (!busy) setPicker(picker === "model" ? null : "model");
              } else if (key.key === "Escape" && picker) {
                setPicker(null);
              }
            }}
            maxLength={16000}
            style={[styles.editor, { color: theme.text }]}
          />
          <View style={styles.toolbar}>
            <Action
              icon="attach"
              label="Attach image"
              compact
              onPress={() => void attach()}
              disabled={uploading || attachments.length >= 4}
            />
            <PickerChip
              label={`${currentModel?.title ?? modelTitle(settings.model)} · ${effortLabel(settings.effort)}`}
              icon={settings.provider}
              open={picker === "model"}
              disabled={busy}
              onPress={() => {
                if (picker !== "model") editor.current?.blur();
                setPicker(picker === "model" ? null : "model");
              }}
            />
            <View style={{ flex: 1 }} />
            {uploading || pending ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : null}
            {busy && sessionId ? (
              <Action
                icon="stop"
                label="Stop agent"
                compact
                emphasis
                onPress={() =>
                  void stop({ sessionId }).catch((e) => setError(String(e)))
                }
              />
            ) : (
              <Action
                icon="send"
                label="Send message"
                compact
                emphasis
                disabled={
                  pending ||
                  uploading ||
                  !projectId ||
                  (!text.trim() && !attachments.length && !pickedSkills.length)
                }
                onPress={() => void submit()}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  feed: { flex: 1 },
  feedContent: {
    width: "100%",
    maxWidth: 768,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 28,
    gap: 8,
  },
  emptyFeed: { flexGrow: 1 },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 32,
    fontWeight: "600",
    letterSpacing: -0.5,
    lineHeight: 38,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 320,
    textAlign: "center",
  },
  message: { gap: 10, maxWidth: "100%" },
  assistantMessage: { marginVertical: 8 },
  userWrap: {
    alignSelf: "flex-end",
    maxWidth: "78%",
    alignItems: "flex-end",
    marginVertical: 8,
    gap: 2,
  },
  userMessage: {
    borderRadius: 22,
    borderCurve: "continuous",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  prose: { fontSize: 16, lineHeight: 24 },
  image: { width: 240, height: 180, maxWidth: "100%", borderRadius: 12 },
  running: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  composerWrap: {
    paddingHorizontal: 16,
    width: "100%",
    maxWidth: 768,
    alignSelf: "center",
  },
  composer: {
    borderRadius: 28,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 6,
    paddingTop: 6,
    paddingBottom: 6,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0 12px 40px rgba(0,0,0,0.28)" },
      default: {},
    }),
  },
  editor: {
    minHeight: 44,
    maxHeight: 180,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: "top",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 4,
    paddingBottom: 2,
  },
  thumbnail: { width: 60, height: 60, borderRadius: 8 },
  jump: { alignSelf: "center", marginBottom: 8 },
  roadmapChip: {
    alignSelf: "center",
    marginTop: 8,
    maxWidth: 320,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderCurve: "continuous",
  },
  skillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  skillChip: {
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderCurve: "continuous",
    justifyContent: "center",
  },
});
