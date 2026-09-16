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
import { Fonts, Colors } from "@/constants/theme";
import type { Id } from "../../../convex/_generated/dataModel";
import { CODEX_MODELS } from "../../../convex/lib/agentModel";
import { Action, Notice } from "./ui";
import {
  EffortMenu,
  ModelMenu,
  PickerChip,
  effortLabel,
  modelTitle,
} from "./model-picker";

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
      <View style={styles.activity}>
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
              fontSize: 12,
              lineHeight: 18,
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
  const dark = theme.background === Colors.dark.background;
  return (
    <View
      style={[
        styles.message,
        user && styles.userMessage,
        user && {
          backgroundColor: dark ? "#2f2f2f" : "#ececee",
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
  const [picker, setPicker] = useState<null | "model" | "effort">(null);
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
    const previous = settings;
    setError("");
    setSettings(next);
    try {
      if (sessionId) await configure({ sessionId, ...next });
    } catch (e) {
      setSettings(previous);
      setError(e instanceof Error ? e.message : "Could not update model.");
    }
  }
  async function submit() {
    if ((!text.trim() && !attachments.length) || pending || busy || !projectId)
      return;
    setPicker(null);
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
                ? `Ask ${projectName} anything.`
                : "Choose a Project to start."}
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
      {picker ? (
        <Pressable
          accessibilityLabel="Dismiss picker"
          onPress={() => setPicker(null)}
          style={[StyleSheet.absoluteFill, { zIndex: 1 }]}
        />
      ) : null}
      <View style={[styles.composerWrap, { zIndex: 2 }]}>
        {error ? <Notice text={error} error /> : null}
        <ModelMenu
          visible={picker === "model"}
          current={settings}
          disabled={busy}
          onSelect={(next) => {
            void changeSettings({ ...settings, ...next });
            setPicker(null);
          }}
        />
        <EffortMenu
          visible={picker === "effort"}
          current={settings.effort}
          disabled={busy}
          onSelect={(effort) => {
            void changeSettings({ ...settings, effort });
            setPicker(null);
          }}
        />
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
            <PickerChip
              label={modelTitle(settings.model)}
              icon={settings.provider}
              open={picker === "model"}
              disabled={busy}
              onPress={() => setPicker(picker === "model" ? null : "model")}
            />
            <View
              style={{
                width: StyleSheet.hairlineWidth,
                height: 14,
                backgroundColor: theme.lineStrong,
                marginHorizontal: 2,
              }}
            />
            <PickerChip
              label={effortLabel(settings.effort)}
              open={picker === "effort"}
              filled
              disabled={busy}
              onPress={() => setPicker(picker === "effort" ? null : "effort")}
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
                  (!text.trim() && !attachments.length)
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
    paddingBottom: 24,
    gap: 24,
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
  userMessage: {
    alignSelf: "flex-end",
    maxWidth: "78%",
    borderRadius: 22,
    borderCurve: "continuous",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  prose: { fontSize: 16, lineHeight: 24 },
  activity: { paddingVertical: 4, paddingHorizontal: 4 },
  activityTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  code: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 20,
    paddingBottom: 8,
  },
  image: { width: 240, height: 180, maxWidth: "100%", borderRadius: 12 },
  running: { flexDirection: "row", gap: 10, alignItems: "center", paddingHorizontal: 4 },
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
  jump: { position: "absolute", bottom: 112, alignSelf: "center" },
});
