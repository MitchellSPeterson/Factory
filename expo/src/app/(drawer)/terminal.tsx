import { useMutation, useQuery } from "@/lib/factory";
import { Drawer } from "expo-router/drawer";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { Action, Notice } from "@/chats/ui";
import { ProjectSwitcher } from "@/components/project-switcher";
import { TerminalDisplay } from "@/terminals/TerminalDisplay";
import { readSelection, writeSelection } from "@/terminals/selection";

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
        <View style={styles.empty}>
          <Text style={[styles.title, { color: theme.text }]}>
            Choose a Project
          </Text>
          <Notice text="Open terminals in a Project's local directory. Your tabs stay here when you leave." />
          <ProjectSwitcher />
        </View>
      )}
    </View>
  );
}
function ProjectTerminals({
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
  return (
    <View style={styles.root}>
      <View style={[styles.project, { borderColor: theme.line }]}>
        <Text style={[styles.title, { color: theme.text }]}>
          {project.name}
        </Text>
        <Text
          numberOfLines={1}
          selectable
          style={{ color: theme.textSecondary, fontSize: 12, flexShrink: 1 }}
        >
          {project.localPath}
        </Text>
      </View>
      <View style={[styles.tabs, { borderColor: theme.line }]}>
        <ScrollView
          horizontal
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: "center", gap: 4 }}
        >
          {tabs?.map((tab) => (
            <View
              key={tab._id}
              style={[
                styles.tab,
                {
                  backgroundColor:
                    active?._id === tab._id
                      ? theme.backgroundSelected
                      : "transparent",
                },
              ]}
            >
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={tab.title}
                aria-selected={active?._id === tab._id}
                accessibilityState={{ selected: active?._id === tab._id }}
                onPress={() => select(tab._id)}
                style={styles.tabLabel}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        tab.state === "running"
                          ? theme.success
                          : theme.textSecondary,
                    },
                  ]}
                />
                <Text style={{ color: theme.text, fontSize: 13 }}>
                  {tab.title}
                </Text>
              </Pressable>
              <Action
                icon="close"
                label={`Close ${tab.title}`}
                compact
                onPress={() => setClosing(tab._id)}
              />
            </View>
          ))}
        </ScrollView>
        <Action
          icon="add"
          label="New terminal"
          disabled={pending || tabs === undefined}
          onPress={() => void add()}
        />
      </View>
      {error ? <Notice text={error} error /> : null}
      {closing ? (
        <View style={styles.confirm}>
          <Notice text="Close this terminal and stop its running programs?" />
          <Action label="Cancel" onPress={() => setClosing(null)} />
          <Action label="Close terminal" onPress={() => void remove(closing)} />
        </View>
      ) : null}
      {tabs === undefined ? (
        <ActivityIndicator style={styles.empty} />
      ) : active ? (
        <TerminalSession key={active._id} tab={active} />
      ) : (
        <View style={styles.empty}>
          <Text style={[styles.title, { color: theme.text }]}>
            No terminals open
          </Text>
          <Notice text="Open a shell to run commands here. Tabs and recent output are saved; shells keep running while the worker is connected." />
          <Action
            icon="add"
            label="Open terminal"
            selected
            disabled={pending}
            onPress={() => void add()}
          />
        </View>
      )}
    </View>
  );
}
function TerminalSession({ tab }: { tab: Doc<"terminals"> }) {
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
  const onInput = useCallback(
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
  const onResize = useCallback(
    (cols: number, rows: number) => {
      void resize({ id: tab._id, cols, rows }).catch((e) => {
        if (mounted.current) setError(String(e));
      });
    },
    [resize, tab._id],
  );
  return (
    <View
      style={[
        styles.root,
        { paddingBottom: Math.max(keyboard, insets.bottom) },
      ]}
    >
      {tab.state === "queued" ? (
        <Notice text="Starting shell…" />
      ) : tab.state === "exited" ? (
        <Notice text={tab.message ?? "Shell exited."} />
      ) : !enabled ? (
        <Notice text="Worker disconnected. Waiting for connection…" error />
      ) : null}
      {error ? <Notice text={error} error /> : null}
      <TerminalDisplay
        output={output?.output ?? ""}
        outputEnd={output?.outputEnd ?? 0}
        enabled={enabled}
        onInput={onInput}
        onResize={onResize}
      />
      <View style={styles.keys}>
        {[
          ["Esc", "\u001b"],
          ["Tab", "\t"],
          ["Ctrl C", "\u0003"],
          ["Ctrl D", "\u0004"],
          ["↑", "\u001b[A"],
          ["↓", "\u001b[B"],
        ].map(([label, data]) => (
          <Action
            key={label}
            label={label}
            disabled={!enabled}
            onPress={() => onInput(data)}
          />
        ))}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  project: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  title: { fontSize: 16, fontWeight: "600" },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 8,
    minHeight: 48,
  },
  tab: { flexDirection: "row", alignItems: "center", borderRadius: 8 },
  tabLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingLeft: 12,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignSelf: "center",
    padding: 24,
    maxWidth: 460,
    gap: 12,
  },
  keys: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 8 },
  confirm: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
});
