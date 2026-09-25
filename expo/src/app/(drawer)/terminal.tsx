import { useMutation, useQuery } from "@/lib/factory";
import { Drawer } from "expo-router/drawer";
import * as Clipboard from "expo-clipboard";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Doc, Id } from "@/lib/dataModel";
import { api } from "@/lib/api";
import { useProjectScope } from "@/lib/project-scope-context";
import { useTheme } from "@/hooks/use-theme";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import { Action } from "@/chats/ui";
import { ProjectSwitcher } from "@/components/project-switcher";
import { TerminalDisplay } from "@/terminals/TerminalDisplay";
import { readSelection, writeSelection } from "@/terminals/selection";

const TERMINAL_BG = "#101113";

export default function TerminalPage() {
  const { currentProject, projects } = useProjectScope();
  const theme = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <Drawer.Screen options={{ title: "Terminal" }} />
      {!projects ? (
        <ActivityIndicator style={styles.empty} />
      ) : currentProject ? (
        <ProjectTerminals key={currentProject._id} project={currentProject} />
      ) : (
        <Empty
          title="Choose a Project"
          body="Terminals open in a Project's folder on this Mac. Your tabs stay open when you leave."
        >
          <ProjectSwitcher />
        </Empty>
      )}
    </View>
  );
}

export function ProjectTerminals({
  project,
}: {
  project: Pick<Doc<"projects">, "_id" | "name" | "localPath">;
}) {
  const theme = useTheme();
  const tabs = useQuery(api.terminals.list, { projectId: project._id });
  const create = useMutation(api.terminals.create);
  const close = useMutation(api.terminals.close);
  const [selected, setSelected] = useState<string | null>(() =>
    readSelection(project._id),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState<Id<"terminals"> | null>(null);
  const active = tabs?.find((tab) => tab._id === selected) ?? tabs?.[0];
  const closingTab = tabs?.find((tab) => tab._id === closing);
  function select(id: Id<"terminals">) {
    setSelected(id);
    writeSelection(project._id, id);
    setClosing(null);
  }
  async function add() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      select(await create({ projectId: project._id }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open terminal.");
    } finally {
      setPending(false);
    }
  }
  async function remove(id: Id<"terminals">) {
    setError("");
    try {
      await close({ id });
      setClosing(null);
      if (active?._id === id) {
        const next = tabs?.find((tab) => tab._id !== id);
        if (next) select(next._id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close terminal.");
    }
  }
  if (tabs === undefined) return <ActivityIndicator style={styles.empty} />;
  if (!tabs.length)
    return (
      <Empty
        icon
        title="No terminals open"
        body={`Open a shell in ${project.localPath}. Tabs and recent output are saved, and shells keep running while this Mac's worker is on.`}
        error={error}
      >
        <Action
          icon="add"
          label={pending ? "Opening…" : "Open terminal"}
          emphasis
          disabled={pending}
          onPress={() => void add()}
        />
      </Empty>
    );
  return (
    <View style={styles.root}>
      <View style={[styles.tabs, { borderColor: theme.line }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={styles.tabList}
        >
          {tabs.map((tab) => {
            const on = active?._id === tab._id;
            return (
              <View
                key={tab._id}
                style={[
                  styles.tab,
                  on && { backgroundColor: theme.backgroundSelected },
                ]}
              >
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel={`${tab.title}, ${stateLabel(tab)}`}
                  aria-selected={on}
                  accessibilityState={{ selected: on }}
                  onPress={() => select(tab._id)}
                  style={[styles.tabLabel, !on && { paddingRight: 14 }]}
                >
                  <View
                    style={[styles.dot, { backgroundColor: stateColor(tab, theme) }]}
                  />
                  <Text
                    numberOfLines={1}
                    style={{
                      color: on ? theme.text : theme.textSecondary,
                      fontSize: 13,
                      fontWeight: on ? "600" : "500",
                      maxWidth: 160,
                    }}
                  >
                    {tab.title}
                  </Text>
                </Pressable>
                {on ? (
                  <Action
                    icon="close"
                    label={`Close ${tab.title}`}
                    compact
                    onPress={() => setClosing(tab._id)}
                  />
                ) : null}
              </View>
            );
          })}
        </ScrollView>
        <Action
          icon="add"
          label="New terminal"
          compact
          disabled={pending}
          onPress={() => void add()}
        />
      </View>
      {error ? (
        <Banner tone="danger" text={error} onClose={() => setError("")} />
      ) : null}
      {closingTab ? (
        <Banner
          tone="danger"
          text={`Close ${closingTab.title}? Anything running in it will stop.`}
        >
          <Action label="Cancel" onPress={() => setClosing(null)} />
          <Action
            label="Close"
            emphasis
            onPress={() => void remove(closingTab._id)}
          />
        </Banner>
      ) : null}
      {active ? (
        <TerminalSession key={active._id} tab={active} onNew={() => void add()} />
      ) : null}
    </View>
  );
}

type Theme = ReturnType<typeof useTheme>;
function live(tab: Doc<"terminals">) {
  return tab.state === "running" && tab.leaseUntil > Date.now();
}
function stateColor(tab: Doc<"terminals">, theme: Theme) {
  if (live(tab)) return theme.success;
  if (tab.state === "queued" || tab.state === "running") return theme.accent;
  return theme.textSecondary;
}
function stateLabel(tab: Doc<"terminals">) {
  if (live(tab)) return "running";
  if (tab.state === "queued") return "starting";
  if (tab.state === "running") return "reconnecting";
  return "exited";
}

// Keys a phone keyboard can't type. Arrows go raw; letters typed after Ctrl become control codes.
const KEYS: [label: string, data: string, accessibilityLabel?: string][] = [
  ["esc", "\u001b", "Escape"],
  ["tab", "\t", "Tab"],
  ["^C", "\u0003", "Control C, interrupt"],
  ["←", "\u001b[D", "Left arrow"],
  ["↑", "\u001b[A", "Up arrow"],
  ["↓", "\u001b[B", "Down arrow"],
  ["→", "\u001b[C", "Right arrow"],
  ["^D", "\u0004", "Control D, end input"],
  ["^L", "\u000c", "Control L, clear screen"],
  ["|", "|"],
  ["~", "~"],
  ["/", "/"],
  ["-", "-"],
];

function TerminalSession({
  tab,
  onNew,
}: {
  tab: Doc<"terminals">;
  onNew: () => void;
}) {
  const theme = useTheme();
  const output = useQuery(api.terminals.output, { id: tab._id });
  const send = useMutation(api.terminals.input);
  const resize = useMutation(api.terminals.resize);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now);
  const keyboard = useKeyboardHeight();
  const insets = useSafeAreaInsets();
  const pending = useRef("");
  const sending = useRef(false);
  const mounted = useRef(true);
  const enabled = tab.state === "running" && tab.leaseUntil > now;
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    mounted.current = true;
    async function flush() {
      if (!pending.current || sending.current) return;
      sending.current = true;
      const data = pending.current.slice(0, 4096);
      pending.current = pending.current.slice(data.length);
      try {
        await send({ id: tab._id, data });
        if (mounted.current) setError("");
      } catch (e) {
        pending.current = "";
        if (mounted.current)
          setError(e instanceof Error ? e.message : "Input could not be sent.");
      } finally {
        sending.current = false;
        if (!mounted.current && pending.current) void flush();
      }
    }
    const timer = setInterval(() => void flush(), 40);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      void flush();
    };
  }, [send, tab._id]);
  const [ctrl, setCtrl] = useState(false);
  const ctrlRef = useRef(false);
  ctrlRef.current = ctrl;
  const sendRaw = useCallback(
    (data: string) => {
      if (!enabled) return;
      if (pending.current.length + data.length > 16_384) {
        setError("Paste up to 16,384 characters at a time.");
        return;
      }
      pending.current += data;
    },
    [enabled],
  );
  const onInput = useCallback(
    (data: string) => {
      if (ctrlRef.current && data.length === 1) {
        setCtrl(false);
        const code = data.toUpperCase().charCodeAt(0);
        if (code >= 64 && code <= 95) return sendRaw(String.fromCharCode(code & 31));
      }
      sendRaw(data);
    },
    [sendRaw],
  );
  const onResize = useCallback(
    (cols: number, rows: number) => {
      void resize({ id: tab._id, cols, rows }).catch((e) => {
        if (mounted.current) setError(String(e));
      });
    },
    [resize, tab._id],
  );
  const touch = Platform.OS !== "web";
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: TERMINAL_BG, paddingBottom: Math.max(keyboard, insets.bottom) },
      ]}
    >
      {tab.state === "queued" ? (
        <Banner tone="busy" text="Starting shell…" />
      ) : tab.state === "exited" ? (
        <Banner tone="muted" text={tab.message ?? "This shell has exited."}>
          <Action icon="add" label="New terminal" onPress={onNew} />
        </Banner>
      ) : !enabled ? (
        <Banner tone="busy" text="Reconnecting to this Mac's worker…" />
      ) : null}
      {error ? (
        <Banner tone="danger" text={error} onClose={() => setError("")} />
      ) : null}
      <TerminalDisplay
        output={output?.output ?? ""}
        outputEnd={output?.outputEnd ?? 0}
        enabled={enabled}
        onInput={onInput}
        onResize={onResize}
      />
      {touch ? (
        <ScrollView
          horizontal
          keyboardShouldPersistTaps="always"
          showsHorizontalScrollIndicator={false}
          style={[styles.keys, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}
          contentContainerStyle={styles.keyList}
        >
          <Key
            label="ctrl"
            accessibilityLabel="Control. The next letter you type is sent with Control"
            on={ctrl}
            disabled={!enabled}
            onPress={() => setCtrl((value) => !value)}
          />
          {KEYS.map(([label, data, a11y]) => (
            <Key
              key={label}
              label={label}
              accessibilityLabel={a11y ?? label}
              disabled={!enabled}
              onPress={() => sendRaw(data)}
            />
          ))}
          <Key
            label="paste"
            accessibilityLabel="Paste from clipboard"
            disabled={!enabled}
            onPress={() =>
              void Clipboard.getStringAsync().then((text) => text && sendRaw(text))
            }
          />
        </ScrollView>
      ) : null}
    </View>
  );
}

function Key({
  label,
  accessibilityLabel,
  on,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel: string;
  on?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole={on === undefined ? "button" : "switch"}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, checked: on }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        {
          backgroundColor: on ? theme.accent : pressed ? theme.backgroundSelected : theme.subtleHover,
          borderColor: on ? theme.accent : theme.line,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      <Text style={{ color: on ? "#ffffff" : theme.text, fontSize: 14, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

function Banner({
  tone,
  text,
  onClose,
  children,
}: {
  tone: "danger" | "busy" | "muted";
  text: string;
  onClose?: () => void;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.banner, { borderColor: theme.line, backgroundColor: theme.background }]}
    >
      {tone === "busy" ? (
        <ActivityIndicator size="small" color={theme.accent} />
      ) : (
        <SymbolView
          name={
            tone === "danger"
              ? { ios: "exclamationmark.triangle.fill", android: "warning", web: "warning" }
              : { ios: "info.circle", android: "info", web: "info" }
          }
          size={16}
          tintColor={tone === "danger" ? theme.danger : theme.textSecondary}
        />
      )}
      <Text
        selectable
        style={{ flex: 1, color: tone === "danger" ? theme.danger : theme.text, fontSize: 14 }}
      >
        {text}
      </Text>
      {children}
      {onClose ? <Action icon="close" label="Dismiss" compact onPress={onClose} /> : null}
    </View>
  );
}

function Empty({
  icon,
  title,
  body,
  error,
  children,
}: {
  icon?: boolean;
  title: string;
  body: string;
  error?: string;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      {icon ? (
        <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundSelected }]}>
          <SymbolView
            name={{ ios: "terminal", android: "terminal", web: "terminal" }}
            size={28}
            tintColor={theme.accent}
          />
        </View>
      ) : null}
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.body, { color: theme.textSecondary }]}>{body}</Text>
      {error ? <Text style={[styles.body, { color: theme.danger }]}>{error}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  title: { fontSize: 18, fontWeight: "600", textAlign: "center" },
  body: { fontSize: 14, lineHeight: 20, textAlign: "center" },
  tabs: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  tabList: { alignItems: "center", gap: 4 },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderCurve: "continuous",
  },
  tabLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingLeft: 14,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 6,
    minHeight: 48,
    borderBottomWidth: 1,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    padding: 24,
    maxWidth: 440,
    gap: 12,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  keys: { flexGrow: 0, borderTopWidth: 1 },
  keyList: { gap: 6, paddingHorizontal: 8, paddingVertical: 6 },
  key: {
    minWidth: 44,
    height: 38,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 8,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
});
