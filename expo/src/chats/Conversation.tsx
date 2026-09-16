import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Keyboard,
  LayoutAnimation,
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
import { File } from "expo-file-system";
import { api } from "@/lib/api";
import { useTheme } from "@/hooks/use-theme";
import { Fonts } from "@/constants/theme";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  AGENT_EFFORTS,
  CODEX_MODELS,
  GROK_MODELS,
} from "../../../convex/lib/agentModel";
import { Action, Notice } from "./ui";

type SessionView = NonNullable<FunctionReturnType<typeof api.sessions.get>>;
type Message = SessionView["messages"][number];
type Settings = Pick<SessionView["session"], "provider" | "model" | "effort">;
type Attachment = { id: Id<"_storage">; uri: string; name: string };

// ponytail: pad from keyboard height — Android edge-to-edge doesn't resize. Upgrade to react-native-keyboard-controller for interactive dismiss.
function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => {
        if (Platform.OS === "ios") {
          LayoutAnimation.configureNext({
            duration: event.duration > 0 ? event.duration : 250,
            update: { type: LayoutAnimation.Types.keyboard },
          });
        }
        setHeight(event.endCoordinates.height);
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      (event) => {
        if (Platform.OS === "ios") {
          LayoutAnimation.configureNext({
            duration: event.duration > 0 ? event.duration : 250,
            update: { type: LayoutAnimation.Types.keyboard },
          });
        }
        setHeight(0);
      },
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

function MessageRow({
  message,
  sessionId,
}: {
  message: Message;
  sessionId: Id<"sessions">;
}) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const resolve = useMutation(api.sessions.resolvePermission);
  const activity = message.kind && message.kind !== "message";
  if (activity)
    return (
      <View style={[styles.activity, { borderColor: theme.line }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          onPress={() => setExpanded(!expanded)}
          style={styles.activityTitle}
        >
          <Text
            style={{
              color:
                message.status === "failed"
                  ? theme.danger
                  : theme.textSecondary,
              fontSize: 13,
              flex: 1,
            }}
          >
            {message.title ||
              (message.kind === "reasoning"
                ? "Thinking"
                : message.kind === "permission"
                  ? "Approval requested"
                  : "Tool activity")}
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
            {message.status}
          </Text>
          <Action
            icon="down"
            label="Toggle activity details"
            compact
            onPress={() => setExpanded(!expanded)}
          />
        </Pressable>
        {expanded && (
          <Text
            selectable
            style={[styles.code, { color: theme.textSecondary }]}
          >
            {message.detail || message.text}
          </Text>
        )}
        {message.kind === "permission" &&
          !message.decision &&
          message.options?.map((option) => (
            <Action
              key={option.optionId}
              label={option.name}
              disabled={pending}
              onPress={() => {
                if (!message.requestId) return;
                setPending(true);
                setError("");
                void resolve({
                  sessionId,
                  requestId: message.requestId,
                  optionId: option.optionId,
                })
                  .catch((e) => setError(String(e)))
                  .finally(() => setPending(false));
              }}
            />
          ))}
        {error ? <Notice text={error} error /> : null}
      </View>
    );
  const user = message.role === "user";
  return (
    <View
      style={[
        styles.message,
        user && styles.userMessage,
        user && {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.line,
          borderWidth: 1,
        },
      ]}
    >
      {user ? (
        <Text selectable style={[styles.prose, { color: theme.text }]}>
          {message.text}
        </Text>
      ) : (
        <Markdown
          style={{
            body: { color: theme.text, fontSize: 15, lineHeight: 25 },
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
      {message.imageUrls
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
}

export function Conversation({
  sessionId,
  projectId,
  projectName,
  onCreated,
}: {
  sessionId: Id<"sessions"> | null;
  projectId: Id<"projects"> | null;
  projectName: string;
  onCreated: (id: Id<"sessions">) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const view = useQuery(api.sessions.get, sessionId ? { sessionId } : "skip");
  const create = useMutation(api.sessions.create);
  const send = useMutation(api.sessions.send);
  const stop = useMutation(api.sessions.stop);
  const configure = useMutation(api.sessions.configure);
  const uploadUrl = useMutation(api.sessions.generateUploadUrl);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    provider: "codex",
    model: CODEX_MODELS[0],
    effort: "medium",
  });
  const scroll = useRef<ScrollView>(null);
  const follow = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const busy =
    view?.session.status === "running" || view?.session.status === "queued";
  useEffect(() => {
    if (view)
      setSettings({
        provider: view.session.provider,
        model: view.session.model,
        effort: view.session.effort,
      });
  }, [view?.session.provider, view?.session.model, view?.session.effort]);
  async function changeSettings(next: Settings) {
    setError("");
    try {
      if (sessionId) await configure({ sessionId, ...next });
      setSettings(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update model.");
    }
  }
  async function submit() {
    if ((!text.trim() && !attachments.length) || pending || busy || !projectId)
      return;
    setPending(true);
    setError("");
    try {
      const args = {
        text: text.trim(),
        imageIds: attachments.map((item) => item.id),
      };
      if (sessionId) await send({ sessionId, ...args });
      else onCreated(await create({ projectId, ...settings, ...args }));
      setText("");
      setAttachments([]);
      follow.current = true;
      setAtBottom(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Message could not be sent.");
    } finally {
      setPending(false);
    }
  }
  async function attach() {
    setUploading(true);
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "image/*",
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset) return;
      if ((asset.size ?? 0) > 10 * 1024 * 1024)
        throw new Error("Choose an image smaller than 10 MB.");
      const body =
        Platform.OS === "web"
          ? await (await fetch(asset.uri)).blob()
          : await new File(asset.uri).bytes();
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
  const gap = Platform.OS === "ios" ? 16 : 8;
  const bottomPad =
    Platform.OS === "web"
      ? 12
      : (keyboard > 0 ? keyboard : insets.bottom) + gap;
  return (
    <View style={[styles.root, { paddingBottom: bottomPad }]}>
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
          view.messages.map((message) => (
            <MessageRow
              key={message._id}
              message={message}
              sessionId={view.session._id}
            />
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              What are we building?
            </Text>
            <Text style={[styles.emptyBody, { color: theme.textSecondary }]}>
              {projectId
                ? `Work with an agent in ${projectName}. Review changes and run commands without leaving the conversation.`
                : "Choose a Project to start a conversation."}
            </Text>
          </View>
        )}
        {busy && (
          <View style={styles.running}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
              {view?.session.status === "queued"
                ? "Waiting for this machine…"
                : "Agent is working…"}
            </Text>
          </View>
        )}
        {view?.session.error ? (
          <Notice text={view.session.error} error />
        ) : null}
      </ScrollView>
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
      <View style={styles.composerWrap}>
        {error ? <Notice text={error} error /> : null}
        {settingsOpen && (
          <View
            style={[
              styles.settings,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.line,
              },
            ]}
          >
            <View style={styles.controls}>
              {(["codex", "grok"] as const).map((provider) => (
                <Action
                  key={provider}
                  label={provider === "codex" ? "Codex" : "Grok"}
                  selected={settings.provider === provider}
                  disabled={busy}
                  onPress={() =>
                    void changeSettings({
                      ...settings,
                      provider,
                      model:
                        provider === "codex" ? CODEX_MODELS[0] : GROK_MODELS[0],
                    })
                  }
                />
              ))}
            </View>
            <ScrollView horizontal>
              {(settings.provider === "codex" ? CODEX_MODELS : GROK_MODELS).map(
                (model) => (
                  <Action
                    key={model}
                    label={model}
                    selected={settings.model === model}
                    disabled={busy}
                    onPress={() => void changeSettings({ ...settings, model })}
                  />
                ),
              )}
            </ScrollView>
            <View style={styles.controls}>
              {AGENT_EFFORTS.map((effort) => (
                <Action
                  key={effort}
                  label={effort}
                  selected={settings.effort === effort}
                  disabled={busy}
                  onPress={() => void changeSettings({ ...settings, effort })}
                />
              ))}
            </View>
          </View>
        )}
        <View
          style={[
            styles.composer,
            {
              backgroundColor: theme.backgroundElement,
              borderColor: theme.lineStrong,
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
          <TextInput
            accessibilityLabel="Message"
            placeholder={
              busy
                ? "Write your next message…"
                : "Ask anything, or describe a change…"
            }
            placeholderTextColor={theme.textSecondary}
            value={text}
            onChangeText={setText}
            multiline
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
            <Action
              icon="down"
              label={settings.model}
              onPress={() => setSettingsOpen(!settingsOpen)}
              selected={settingsOpen}
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
                selected
                onPress={() =>
                  void stop({ sessionId }).catch((e) => setError(String(e)))
                }
              />
            ) : (
              <Action
                icon="send"
                label="Send message"
                compact
                selected
                disabled={
                  pending ||
                  uploading ||
                  !projectId ||
                  (!text.trim() && !attachments.length)
                }
                onPress={() => void submit()}
              />
            )}
          </View>
        </View>
        <View style={styles.footer}>
          <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
            {projectName || "No Project selected"} · {settings.effort} effort
          </Text>
          {view?.session.usage && (
            <Text style={{ color: theme.textSecondary, fontSize: 11 }}>
              {view.session.usage.totalTokens.toLocaleString()} tokens
            </Text>
          )}
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
    maxWidth: 820,
    alignSelf: "center",
    padding: 20,
    paddingBottom: 32,
    gap: 20,
  },
  emptyFeed: { flexGrow: 1 },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 26,
    fontWeight: "600",
    letterSpacing: -0.7,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 23,
    maxWidth: 340,
    textAlign: "center",
  },
  message: { gap: 10 },
  userMessage: {
    alignSelf: "flex-end",
    maxWidth: "90%",
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  prose: { fontSize: 15, lineHeight: 24 },
  activity: { borderBottomWidth: 1, paddingBottom: 6 },
  activityTitle: { flexDirection: "row", alignItems: "center", gap: 10 },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 20,
    paddingBottom: 12,
  },
  image: { width: 240, height: 180, maxWidth: "100%", borderRadius: 12 },
  running: { flexDirection: "row", gap: 10, alignItems: "center" },
  composerWrap: {
    paddingHorizontal: 16,
    width: "100%",
    maxWidth: 820,
    alignSelf: "center",
  },
  composer: { borderRadius: 20, borderWidth: 1, padding: 8 },
  editor: {
    minHeight: 66,
    maxHeight: 180,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 23,
    textAlignVertical: "top",
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 2,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingTop: 10,
  },
  settings: { borderRadius: 16, borderWidth: 1, padding: 8, marginBottom: 8 },
  controls: { flexDirection: "row", flexWrap: "wrap" },
  thumbnail: { width: 60, height: 60, borderRadius: 8 },
  jump: { position: "absolute", bottom: 190, alignSelf: "center" },
});
