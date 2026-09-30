import { useMutation, useQuery } from "@/lib/factory";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Keyboard, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { AIInput } from "panelui-native/components/ai-input";
import { Alert } from "panelui-native/components/alert";
import { Attachment as FileAttachment } from "panelui-native/components/attachment";
import { Avatar } from "panelui-native/components/avatar";
import { Button } from "panelui-native/components/button";
import { Chip } from "panelui-native/components/chip";
import { EmptyState } from "panelui-native/components/empty-state";
import { Message as ChatMessage } from "panelui-native/components/message";
import {
  MessageScroller,
  useMessageScroller,
} from "panelui-native/components/message-scroller";
import { Response } from "panelui-native/components/response";
import { Spinner } from "panelui-native/components/spinner";
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  PaperclipIcon,
  SendArrowIcon,
  SparklesIcon,
  XIcon,
} from "panelui-native/icons";
import { Text } from "panelui-native/primitives/text";
import { readPickedAttachment } from "./pickedAttachment";
import * as Clipboard from "expo-clipboard";
import { api } from "@/lib/api";
import { withSkillMentions } from "../../../shared/sessionText";
import { dockedBottomPad } from "@/lib/keyboardInset";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import { useDesktop } from "@/hooks/use-desktop";
import type { Id } from "@/lib/dataModel";
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
import { ModelMenu, effortLabel, modelTitle, useChatModels } from "./model-picker";
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
type PendingImage = { id: Id<"_storage">; uri: string; name: string };
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
  return (
    <Chip
      size="sm"
      variant="outline"
      onClose={onRemove}
      accessibilityLabel={onRemove ? `Remove skill ${slug}` : `skill:${slug}`}>
      {`skill:${slug}`}
    </Chip>
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
    <Button
      size="icon"
      variant="ghost"
      accessibilityLabel={copied ? "Copied prompt" : "Copy prompt"}
      onPress={() => {
        void Clipboard.setStringAsync(payload)
          .then((ok) => {
            if (!ok) return;
            setCopied(true);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 1500);
          })
          .catch(() => {});
      }}>
      {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
    </Button>
  );
}

function MessageRow({
  message,
  skills,
}: {
  message: Message;
  skills: PickedSkill[];
}) {
  const user = message.role === "user";
  const images = (message.imageUrls ?? []).filter((url): url is string => url !== null);
  const streaming = !user && message.status === "inProgress";
  return (
    <ChatMessage align={user ? "end" : "start"}>
      {!user ? (
        <ChatMessage.Avatar>
          <Avatar size="sm" fallback="F" />
        </ChatMessage.Avatar>
      ) : null}
      <ChatMessage.Content>
        {skills.length > 0 ? (
          <View className="flex-row flex-wrap gap-1.5">
            {skills.map((skill) => (
              <SkillChip key={skill.slug} slug={skill.slug} />
            ))}
          </View>
        ) : null}
        {user ? (
          message.text ? (
            <ChatMessage.Bubble>
              <ChatMessage.BubbleContent selectable>{message.text}</ChatMessage.BubbleContent>
            </ChatMessage.Bubble>
          ) : null
        ) : message.text || streaming ? (
          <Response isStreaming={streaming}>{message.text}</Response>
        ) : null}
        {images.map((uri, i) => (
          <Image
            key={i}
            source={{ uri }}
            accessibilityLabel="Message attachment"
            className="h-40 w-full rounded-xl"
            resizeMode="contain"
          />
        ))}
        {user ? (
          <ChatMessage.Actions>
            <CopyPromptButton text={message.text} slugs={message.skillSlugs ?? []} />
          </ChatMessage.Actions>
        ) : null}
      </ChatMessage.Content>
    </ChatMessage>
  );
}

export function Conversation(props: {
  sessionId: Id<"sessions"> | null;
  projectId: Id<"projects"> | null;
  projectName: string;
  roadmapItemId?: Id<"roadmapItems"> | null;
  onCreated: (id: Id<"sessions">) => void;
}) {
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const bottomPad = dockedBottomPad({
    keyboardHeight: keyboard,
    insetBottom: insets.bottom,
    platform: Platform.OS,
    gap: keyboard > 0 ? 0 : Platform.OS === "ios" ? 16 : 8,
    webPad: 12,
  });
  return (
    <View className="min-h-0 flex-1 bg-background" style={{ paddingBottom: bottomPad }}>
      <MessageScroller autoScroll defaultScrollPosition="end" className="min-h-0 flex-1">
        <ConversationBody {...props} />
      </MessageScroller>
    </View>
  );
}

function ConversationBody({
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
  const { scrollToEnd } = useMessageScroller();
  const router = useRouter();
  const view = useQuery<SessionView | null>(api.sessions.get, sessionId ? { sessionId } : "skip");
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
  const project = useQuery(api.projects.get, projectId ? { projectId } : "skip");
  const catalog = project?.skills ?? [];
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<PendingImage[]>([]);
  const [pickedSkills, setPickedSkills] = useState<PickedSkill[]>([]);
  const [picker, setPicker] = useState<null | "model" | "branch">(null);
  const [settings, setSettings] = useState<ChatSettings>(readLastSettings);
  const models = useChatModels();
  const currentModel = models?.find(
    (row) => row.provider === settings.provider && row.model === settings.model,
  );
  const desktop = useDesktop();
  const busy = view?.session.status === "running" || view?.session.status === "queued";
  const awaitingApproval =
    view?.session.status === "running" && hasPendingPermission(view?.messages ?? []);
  const feed = useMemo(() => groupChatFeed(view?.messages ?? []), [view?.messages]);
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
      scrollToEnd(true);
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
    const result = await DocumentPicker.getDocumentAsync({
      type: "image/*",
      multiple: false,
      copyToCacheDirectory: false,
    }).catch((e) => {
      setError(e instanceof Error ? e.message : "Could not attach image.");
      return null;
    });
    const asset = result && !result.canceled ? result.assets[0] : null;
    if (asset) await upload(asset);
  }
  async function upload(asset: { uri: string; name: string; size?: number; mimeType?: string }) {
    setUploading(true);
    setError("");
    try {
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
  // Web: drop or paste images anywhere on the page. ponytail: page-wide, not scoped to the composer.
  const dropRef = useRef<(files: File[]) => void>(() => {});
  dropRef.current = (files) => {
    const room = 4 - attachments.length;
    if (uploading || room <= 0) return;
    const image = files.find((file) => file.type.startsWith("image/"));
    if (image) void upload({ uri: URL.createObjectURL(image), name: image.name, size: image.size, mimeType: image.type });
  };
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      dropRef.current(Array.from(e.dataTransfer.files));
    };
    const paste = (e: ClipboardEvent) => dropRef.current(Array.from(e.clipboardData?.files ?? []));
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    document.addEventListener("paste", paste);
    return () => {
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
      document.removeEventListener("paste", paste);
    };
  }, []);

  if (sessionId && view === undefined) {
    return (
      <View className="flex-1 items-center justify-center">
        <Spinner size="md" label="Loading conversation" />
      </View>
    );
  }
  if (sessionId && view === null) {
    return (
      <View className="flex-1 justify-center px-4">
        <Alert>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Conversation unavailable</Alert.Title>
            <Alert.Description>
              This conversation is no longer available. Choose another or start a new one.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      </View>
    );
  }

  const extraSend =
    !busy && !text.trim() && (attachments.length > 0 || pickedSkills.length > 0);
  const modelLabel = currentModel?.title ?? modelTitle(settings.model);

  return (
    <View className="min-h-0 flex-1">
      {view?.roadmapItem ? (
        <Chip
          size="sm"
          variant="outline"
          className="mx-4 mt-2 self-start"
          accessibilityLabel={`Roadmap item ${view.roadmapItem.title}`}
          onPress={() => router.push(`/roadmap?item=${view.roadmapItem!._id}`)}>
          {`Roadmap · ${view.roadmapItem.title}`}
        </Chip>
      ) : null}
      <View className="relative min-h-0 flex-1">
        <MessageScroller.Viewport
          className="flex-1"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled">
          <MessageScroller.Content>
            {view?.messages.length ? (
              feed.map((row) => {
                if (row.type === "work") {
                  return (
                    <MessageScroller.Item key={row.id} messageId={row.id}>
                      <WorkGroup
                        messages={row.messages}
                        live={
                          busy &&
                          row.messages.some(
                            (message) => message.status === "inProgress" && message.kind === "tool",
                          )
                        }
                        sessionLive={busy}
                      />
                    </MessageScroller.Item>
                  );
                }
                if (row.type === "permission") {
                  return (
                    <MessageScroller.Item key={row.message._id} messageId={row.message._id}>
                      <ActivityRow
                        message={row.message}
                        sessionId={view.session._id}
                        canResolve={view.session.status === "running"}
                      />
                    </MessageScroller.Item>
                  );
                }
                return (
                  <MessageScroller.Item
                    key={row.message._id}
                    messageId={row.message._id}
                    scrollAnchor={row.message.role === "user"}>
                    <MessageRow
                      message={row.message}
                      skills={labelsFor(row.message.skillSlugs, catalog)}
                    />
                  </MessageScroller.Item>
                );
              })
            ) : (
              <EmptyState className="py-16">
                <EmptyState.Media variant="icon">
                  <SparklesIcon size={28} />
                </EmptyState.Media>
                <EmptyState.Title>What are we building?</EmptyState.Title>
                <EmptyState.Description>
                  {projectId ? `Ask ${projectName} anything.` : "Choose a Project to start."}
                </EmptyState.Description>
              </EmptyState>
            )}
            {view?.session.status === "queued" ? (
              <View className="flex-row items-center gap-2 px-1">
                <Spinner size="sm" />
                <Text className="text-sm text-muted-foreground">Waiting for this machine…</Text>
              </View>
            ) : null}
            {showThinking ? <ThinkingRow /> : null}
            {view?.session.error ? (
              <Alert variant="destructive">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{view.session.error}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null}
          </MessageScroller.Content>
        </MessageScroller.Viewport>
        <MessageScroller.Button accessibilityLabel="Latest message" className="bottom-3" />
      </View>
      {picker ? (
        <Pressable
          accessibilityLabel="Dismiss picker"
          onPress={() => setPicker(null)}
          className="absolute inset-0 z-10"
        />
      ) : null}
      <View className="z-20 gap-2 px-3 pb-2">
        {error ? (
          <Alert variant="destructive">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}
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
              if (picker !== "branch") Keyboard.dismiss();
              setPicker(picker === "branch" ? null : "branch");
            }}
            onClose={() => setPicker(null)}
          />
        ) : null}
        <AIInput
          avoidKeyboard={false}
          value={text}
          onValueChange={(next) => {
            if (slashQuery(next) !== null) setPicker(null);
            setText(next);
          }}
          status={busy ? "streaming" : "ready"}
          disabled={!projectId || pending || uploading}
          onSubmit={() => {
            void submit();
          }}
          onStop={() => {
            if (!sessionId) return;
            void stop({ sessionId }).catch((e) => setError(String(e)));
          }}>
          {attachments.length > 0 ? (
            <View className="flex-row flex-wrap gap-2 px-2 pt-2">
              {attachments.map((item) => (
                <FileAttachment
                  key={item.id}
                  state={uploading ? "uploading" : "done"}
                  orientation="vertical"
                  size="sm"
                  className="w-24">
                  <FileAttachment.Media variant="image">
                    <Image source={{ uri: item.uri }} className="h-16 w-full" accessibilityLabel={item.name} />
                  </FileAttachment.Media>
                  <FileAttachment.Actions>
                    <FileAttachment.Action
                      accessibilityLabel={`Remove ${item.name}`}
                      onPress={() =>
                        setAttachments((previous) => previous.filter((image) => image.id !== item.id))
                      }>
                      <XIcon size={14} />
                    </FileAttachment.Action>
                  </FileAttachment.Actions>
                </FileAttachment>
              ))}
            </View>
          ) : null}
          {pickedSkills.length > 0 ? (
            <View className="flex-row flex-wrap gap-1.5 px-2 pt-2">
              {pickedSkills.map((skill) => (
                <SkillChip
                  key={skill.slug}
                  slug={skill.slug}
                  onRemove={() =>
                    setPickedSkills((previous) => previous.filter((row) => row.slug !== skill.slug))
                  }
                />
              ))}
            </View>
          ) : null}
          <AIInput.Field
            accessibilityLabel="Message"
            placeholder={busy ? "Write your next message…" : "Ask anything, or type /"}
            autoFocus={desktop}
            maxLength={16000}
            onFocus={() => setPicker(null)}
            onKeyPress={(event) => {
              if (!desktop) return;
              const key = event.nativeEvent as unknown as KeyboardEvent;
              if (key.key === "Enter" && !key.shiftKey && !key.isComposing) {
                (event as unknown as { preventDefault?: () => void }).preventDefault?.();
                if (slashOpen && items[0]) pickSlash(items[0]);
                else void submit();
              } else if (key.key === "/" && (key.metaKey || key.ctrlKey)) {
                (event as unknown as { preventDefault?: () => void }).preventDefault?.();
                if (!busy) setPicker(picker === "model" ? null : "model");
              } else if (key.key === "Escape" && picker) {
                setPicker(null);
              }
            }}
          />
          <AIInput.Toolbar>
            <AIInput.Action
              label="Attach image"
              icon={<PaperclipIcon size={18} />}
              disabled={uploading || attachments.length >= 4}
              onPress={() => void attach()}
            />
            <AIInput.Pill
              label={modelLabel}
              detail={effortLabel(settings.effort)}
              indicator={<ChevronDownIcon size={14} />}
              disabled={busy}
              accessibilityLabel="Choose model"
              onPress={() => {
                Keyboard.dismiss();
                setPicker(picker === "model" ? null : "model");
              }}
            />
            <AIInput.Spacer />
            {extraSend ? (
              <Button
                size="icon"
                accessibilityLabel="Send message"
                disabled={pending || uploading || !projectId}
                onPress={() => void submit()}>
                <SendArrowIcon size={18} />
              </Button>
            ) : (
              <AIInput.Submit sendLabel="Send message" stopLabel="Stop agent" />
            )}
          </AIInput.Toolbar>
        </AIInput>
      </View>
    </View>
  );
}
