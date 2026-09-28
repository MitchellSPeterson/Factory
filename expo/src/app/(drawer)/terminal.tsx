import { useMutation, useQuery } from "@/lib/factory";
import { Drawer } from "expo-router/drawer";
import * as Clipboard from "expo-clipboard";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Alert } from "panelui-native/components/alert";
import { Button } from "panelui-native/components/button";
import { EmptyState as PanelEmpty } from "panelui-native/components/empty-state";
import { Spinner } from "panelui-native/components/spinner";
import { CheckCircleIcon, PlusIcon, XIcon } from "panelui-native/icons";

import type { Doc, Id } from "@/lib/dataModel";
import { api } from "@/lib/api";
import { useProjectScope } from "@/lib/project-scope-context";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import { ProjectSwitcher } from "@/components/project-switcher";
import { TerminalDisplay } from "@/terminals/TerminalDisplay";
import { readSelection, writeSelection } from "@/terminals/selection";

export default function TerminalPage() {
  const { currentProject, projects } = useProjectScope();
  return (
    <View className="min-h-0 flex-1 bg-background">
      <Drawer.Screen options={{ title: "Terminal" }} />
      {!projects ? (
        <View className="flex-1 items-center justify-center">
          <Spinner />
        </View>
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
  if (tabs === undefined)
    return (
      <View className="flex-1 items-center justify-center">
        <Spinner />
      </View>
    );
  if (!tabs.length)
    return (
      <Empty icon title="No terminals open" body={`Open a shell in ${project.localPath}. Tabs and recent output are saved, and shells keep running while this Mac's worker is on.`} error={error}>
        <Button variant="primary" startContent={<PlusIcon size={16} />} disabled={pending} onPress={() => void add()}>
          {pending ? "Opening…" : "Open terminal"}
        </Button>
      </Empty>
    );
  return (
    <View className="min-h-0 flex-1">
      <View className="flex-row items-center gap-1 border-b border-border px-2 py-1">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerClassName="items-center gap-1"
        >
          {tabs.map((tab) => {
            const on = active?._id === tab._id;
            return (
              <View
                key={tab._id}
                className={`flex-row items-center rounded-[10px] ${on ? "bg-accent" : ""}`}
              >
                <Pressable
                  accessibilityRole="tab"
                  accessibilityLabel={`${tab.title}, ${stateLabel(tab)}`}
                  aria-selected={on}
                  accessibilityState={{ selected: on }}
                  onPress={() => select(tab._id)}
                  className={`min-h-11 flex-row items-center gap-2 pl-3.5 ${on ? "" : "pr-3.5"}`}
                >
                  <View className={`h-2 w-2 rounded-full ${stateDotClass(tab)}`} />
                  <Text
                    numberOfLines={1}
                    className={on ? "text-[13px] font-semibold text-foreground" : "text-[13px] font-medium text-muted-foreground"}
                    style={{ maxWidth: 160 }}
                  >
                    {tab.title}
                  </Text>
                </Pressable>
                {on ? (
                  <Button variant="ghost" size="icon" accessibilityLabel={`Close ${tab.title}`} onPress={() => setClosing(tab._id)}>
                    <XIcon size={14} />
                  </Button>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
        <Button variant="ghost" size="icon" accessibilityLabel="New terminal" disabled={pending} onPress={() => void add()}>
          <PlusIcon size={16} />
        </Button>
      </View>
      {error ? (
        <Banner tone="danger" text={error} onClose={() => setError("")} />
      ) : null}
      {closingTab ? (
        <Banner tone="danger" text={`Close ${closingTab.title}? Anything running in it will stop.`}>
          <Button variant="ghost" size="sm" onPress={() => setClosing(null)}>Cancel</Button>
          <Button variant="destructive" size="sm" onPress={() => void remove(closingTab._id)}>Close</Button>
        </Banner>
      ) : null}
      {active ? (
        <TerminalSession key={active._id} tab={active} onNew={() => void add()} />
      ) : null}
    </View>
  );
}

function live(tab: Doc<"terminals">) {
  return tab.state === "running" && tab.leaseUntil > Date.now();
}
function stateDotClass(tab: Doc<"terminals">) {
  if (live(tab)) return "bg-success";
  if (tab.state === "queued" || tab.state === "running") return "bg-primary";
  return "bg-muted-foreground";
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
      className="min-h-0 flex-1 bg-background"
      style={{ paddingBottom: Math.max(keyboard, insets.bottom) }}
    >
      {tab.state === "queued" ? (
        <Banner tone="busy" text="Starting shell…" />
      ) : tab.state === "exited" ? (
        <Banner tone="muted" text={tab.message ?? "This shell has exited."}>
          <Button variant="secondary" size="sm" startContent={<PlusIcon size={14} />} onPress={onNew}>
            New terminal
          </Button>
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
          className="flex-grow-0 border-t border-border bg-card"
          contentContainerClassName="gap-1.5 px-2 py-1.5"
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
  return (
    <Pressable
      accessibilityRole={on === undefined ? "button" : "switch"}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled, checked: on }}
      disabled={disabled}
      onPress={onPress}
      className={`h-[38px] min-w-11 items-center justify-center rounded-lg border px-2.5 active:opacity-80 ${
        on ? "border-primary bg-primary" : "border-border bg-muted"
      } ${disabled ? "opacity-40" : ""}`}
    >
      <Text className={`text-sm font-semibold ${on ? "text-primary-foreground" : "text-foreground"}`}>
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
  const variant = tone === "danger" ? "destructive" : tone === "busy" ? "info" : "default";
  return (
    <Alert variant={variant} className="rounded-none border-x-0 border-t-0">
      {tone === "busy" ? <Spinner size="sm" /> : <Alert.Indicator />}
      <Alert.Content className="flex-1">
        <Alert.Description selectable>{text}</Alert.Description>
      </Alert.Content>
      {children}
      {onClose ? (
        <Button variant="ghost" size="icon" accessibilityLabel="Dismiss" onPress={onClose}>
          <XIcon size={16} />
        </Button>
      ) : null}
    </Alert>
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
  return (
    <PanelEmpty className="max-w-[440px] flex-1 self-center px-6">
      {icon ? (
        <PanelEmpty.Media variant="icon">
          <CheckCircleIcon size={28} />
        </PanelEmpty.Media>
      ) : null}
      <PanelEmpty.Title className="text-center">{title}</PanelEmpty.Title>
      <PanelEmpty.Description className="text-center">{body}</PanelEmpty.Description>
      {error ? <Text className="text-center text-sm leading-5 text-destructive">{error}</Text> : null}
      {children ? <PanelEmpty.Content>{children}</PanelEmpty.Content> : null}
    </PanelEmpty>
  );
}
