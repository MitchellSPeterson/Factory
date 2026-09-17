import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Id } from "../../../convex/_generated/dataModel";
import { api } from "@/lib/api";
import { dockedBottomPad } from "@/lib/keyboardInset";
import { Fonts } from "@/constants/theme";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import { useTheme } from "@/hooks/use-theme";
import { Action, Notice } from "./ui";

export function ProjectTools({
  projectId,
  localPath,
  panel,
  visible,
  onClose,
}: {
  projectId: Id<"projects">;
  localPath: string;
  panel: "git" | "terminal";
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const rows = useQuery(api.projectOperations.list, { projectId });
  const enqueue = useMutation(api.projectOperations.enqueue);
  const cancel = useMutation(api.projectOperations.cancel);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [command, setCommand] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [diffId, setDiffId] = useState<Id<"projectOperations"> | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const snapshot = rows?.find(
    (row) => row.operation.kind === "status" && row.result?.kind === "status",
  );
  const git = snapshot?.result?.kind === "status" ? snapshot.result : undefined;
  const diff = rows?.find((row) => row._id === diffId);
  const active = rows?.find(
    (row) => row.state === "queued" || row.state === "running",
  );
  const latestStatus = rows?.find((row) => row.operation.kind === "status");
  const commits = rows?.filter((row) => row.operation.kind === "commit") ?? [];
  const terminal =
    rows?.filter((row) => row.operation.kind === "terminal").reverse() ?? [];
  const selected = git?.files.filter((item) => !excluded.has(item.path)) ?? [];
  async function refresh() {
    try {
      setError("");
      await enqueue({ projectId, operation: { kind: "status" } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read changes.");
    }
  }
  useEffect(() => {
    if (visible && panel === "git") void refresh();
  }, [visible, panel, projectId]);
  useEffect(() => {
    if (!visible || panel !== "git") return;
    const timer = setInterval(() => {
      if (!active) void refresh();
    }, 15_000);
    return () => clearInterval(timer);
  }, [visible, panel, projectId, active?._id]);
  async function openDiff(path: string) {
    setFile(path);
    setDiffId(null);
    setError("");
    try {
      setDiffId(
        await enqueue({ projectId, operation: { kind: "diff", path } }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load diff.");
    }
  }
  async function commit() {
    if (!message.trim() || !selected.length || pending) return;
    setPending(true);
    setError("");
    try {
      await enqueue({
        projectId,
        operation: {
          kind: "commit",
          message: message.trim(),
          paths: selected.map((item) => item.path),
          expectedBranch: git?.branch,
        },
      });
      setMessage("");
      await enqueue({ projectId, operation: { kind: "status" } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Commit failed.");
    } finally {
      setPending(false);
    }
  }
  async function execute() {
    if (!command.trim() || pending) return;
    setPending(true);
    setError("");
    try {
      await enqueue({ projectId, operation: { kind: "terminal", command } });
      setCommand("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Command failed.");
    } finally {
      setPending(false);
    }
  }
  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      backgroundColor: theme.backgroundElement,
      borderColor: theme.line,
    },
  ];
  const bottomPad = dockedBottomPad({
    keyboardHeight: keyboard,
    insetBottom: insets.bottom,
    platform: Platform.OS,
    gap: Platform.OS === "ios" ? 16 : 8,
  });
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: theme.background, paddingBottom: bottomPad },
      ]}
    >
      <View style={[styles.header, { borderColor: theme.line }]}>
        {file && panel === "git" ? (
          <Action
            icon="back"
            label="Changed files"
            compact
            onPress={() => setFile(null)}
          />
        ) : null}
        <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
          {panel === "terminal" ? "Terminal" : (file ?? "Changes")}
        </Text>
        {panel === "git" && (
          <Action
            icon="refresh"
            label="Refresh changes"
            compact
            disabled={!!active}
            onPress={() => void refresh()}
          />
        )}
        <Action icon="close" label="Close panel" compact onPress={onClose} />
      </View>
      {error ? <Notice text={error} error /> : null}
      {panel === "git" ? (
        <>
          {file ? (
            <ScrollView>
              <ScrollView contentContainerStyle={styles.diff} horizontal>
                <View>
                  {!diff && !error ? (
                    <ActivityIndicator color={theme.accent} />
                  ) : null}
                  {diff?.state === "queued" || diff?.state === "running" ? (
                    <Notice text="Loading diff…" />
                  ) : null}
                  {diff?.error && <Notice text={diff.error} error />}
                  {diff?.result?.kind === "text" &&
                    diff.result.text.split("\n").map((line, i) => (
                      <Text
                        selectable
                        key={i}
                        style={{
                          fontFamily: Fonts.mono,
                          fontSize: 12,
                          lineHeight: 20,
                          color: line.startsWith("+")
                            ? theme.success
                            : line.startsWith("-")
                              ? theme.danger
                              : theme.textSecondary,
                        }}
                      >
                        {line || " "}
                      </Text>
                    ))}
                </View>
              </ScrollView>
            </ScrollView>
          ) : (
            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                Branch
              </Text>
              <Text selectable style={[styles.title, { color: theme.text }]}>
                {git?.branch ?? "Reading repository…"}
              </Text>
              {latestStatus?.error && (
                <Notice text={latestStatus.error} error />
              )}
              {git && (
                <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                  {git.files.length
                    ? `${selected.length} of ${git.files.length} files selected`
                    : "Working tree clean"}
                </Text>
              )}
              {git?.files.map((item) => (
                <View
                  key={item.path}
                  style={[styles.file, { borderColor: theme.line }]}
                >
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={`Include ${item.path}`}
                    accessibilityState={{ checked: !excluded.has(item.path) }}
                    onPress={() =>
                      setExcluded((previous) => {
                        const next = new Set(previous);
                        next.has(item.path)
                          ? next.delete(item.path)
                          : next.add(item.path);
                        return next;
                      })
                    }
                    style={styles.checkbox}
                  >
                    <View
                      style={[
                        styles.check,
                        {
                          borderColor: excluded.has(item.path)
                            ? theme.lineStrong
                            : theme.accent,
                          backgroundColor: excluded.has(item.path)
                            ? "transparent"
                            : theme.backgroundSelected,
                        },
                      ]}
                    >
                      <Text style={{ color: theme.accent, fontSize: 11 }}>
                        {excluded.has(item.path) ? "" : "✓"}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View diff for ${item.path}`}
                    onPress={() => void openDiff(item.path)}
                    style={styles.filename}
                  >
                    <Text
                      numberOfLines={2}
                      style={{
                        color: theme.text,
                        fontFamily: Fonts.mono,
                        fontSize: 12,
                      }}
                    >
                      {item.path}
                    </Text>
                  </Pressable>
                  <Text
                    style={{
                      color: item.status.includes("D")
                        ? theme.danger
                        : theme.success,
                      fontFamily: Fonts.mono,
                      fontSize: 12,
                    }}
                  >
                    {item.status.trim()}
                  </Text>
                </View>
              ))}
              {!!git?.files.length && (
                <View style={styles.commit}>
                  <TextInput
                    accessibilityLabel="Commit message"
                    placeholder="Describe these changes…"
                    placeholderTextColor={theme.textSecondary}
                    value={message}
                    onChangeText={setMessage}
                    multiline
                    style={inputStyle}
                  />
                  <Action
                    icon="check"
                    label={`Commit ${selected.length} ${selected.length === 1 ? "file" : "files"}`}
                    selected
                    onPress={() => void commit()}
                    disabled={
                      pending || !!active || !message.trim() || !selected.length
                    }
                  />
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    Commits selected files on {git.branch}. No push.
                  </Text>
                </View>
              )}
              {commits.slice(0, 2).map((row) => (
                <View key={row._id}>
                  <Notice
                    text={
                      row.error ??
                      (row.result?.kind === "text"
                        ? row.result.text
                        : `Commit ${row.state}…`)
                    }
                    error={row.state === "failed"}
                  />
                </View>
              ))}
            </ScrollView>
          )}
        </>
      ) : (
        <>
          <Text
            numberOfLines={1}
            style={[styles.cwd, { color: theme.textSecondary }]}
          >
            {localPath}
          </Text>
          <ScrollView
            ref={scroll}
            style={styles.terminal}
            contentContainerStyle={styles.body}
            onContentSizeChange={() =>
              scroll.current?.scrollToEnd({ animated: false })
            }
          >
            {!terminal.length && (
              <Notice text="Run a command in this Project. Each command starts in the directory above; interactive programs are not supported yet." />
            )}
            {terminal.map((row) => (
              <View key={row._id} style={styles.command}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Reuse command"
                  onPress={() => {
                    if (row.operation.kind === "terminal")
                      setCommand(row.operation.command);
                  }}
                >
                  <Text selectable style={[styles.code, { color: theme.text }]}>
                    {row.operation.kind === "terminal"
                      ? `$ ${row.operation.command}`
                      : ""}
                  </Text>
                </Pressable>
                <Text
                  selectable
                  style={[styles.code, { color: theme.textSecondary }]}
                >
                  {row.result?.kind === "text" ? row.result.text : row.output}
                </Text>
                {row.error ? (
                  <Notice text={row.error} error />
                ) : (
                  <Text
                    style={{
                      color:
                        row.result?.kind === "text" && row.result.exitCode !== 0
                          ? theme.danger
                          : theme.textSecondary,
                      fontSize: 11,
                    }}
                  >
                    {row.result?.kind === "text"
                      ? `Exited ${row.result.exitCode}`
                      : row.state}
                  </Text>
                )}
                {(row.state === "running" || row.state === "queued") && (
                  <Action
                    icon="stop"
                    label="Stop command"
                    onPress={() =>
                      void cancel({ id: row._id }).catch((e) =>
                        setError(String(e)),
                      )
                    }
                  />
                )}
              </View>
            ))}
          </ScrollView>
          <View style={[styles.commandInput, { borderColor: theme.line }]}>
            <TextInput
              accessibilityLabel="Terminal command"
              placeholder="Enter a command…"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              value={command}
              onChangeText={setCommand}
              onSubmitEditing={() => void execute()}
              style={[
                styles.code,
                { color: theme.text, flex: 1, minHeight: 44 },
              ]}
            />
            <Action
              icon="send"
              label="Run command"
              compact
              disabled={!command.trim() || pending}
              onPress={() => void execute()}
            />
          </View>
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderBottomWidth: 1,
    gap: 4,
  },
  title: { fontWeight: "600", fontSize: 16, flexShrink: 1, flexGrow: 1 },
  body: { padding: 20, gap: 12 },
  file: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    minHeight: 52,
  },
  checkbox: { padding: 12 },
  check: {
    width: 18,
    height: 18,
    borderWidth: 1,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  filename: { flex: 1, paddingVertical: 14 },
  input: {
    padding: 14,
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 12,
    fontSize: 14,
    textAlignVertical: "top",
  },
  commit: { gap: 10, marginTop: 20 },
  diff: { padding: 16 },
  cwd: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontFamily: Fonts.mono,
    fontSize: 11,
  },
  terminal: { flex: 1 },
  command: { gap: 6, marginBottom: 16 },
  code: { fontFamily: Fonts.mono, fontSize: 12, lineHeight: 20 },
  commandInput: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderTopWidth: 1,
  },
});
