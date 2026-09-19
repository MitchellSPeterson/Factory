import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { Infer } from "convex/values";
import {
  operationResult,
  projectOperation,
} from "../../../convex/lib/projectOperations";
import { api } from "@/lib/api";
import { dockedBottomPad } from "@/lib/keyboardInset";
import { Fonts } from "@/constants/theme";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import { useTheme } from "@/hooks/use-theme";
import { Action, Notice } from "@/chats/ui";
import {
  formatAheadBehind,
  formatCommitAge,
  formatFileStatus,
  GIT_TABS,
  localBranches,
  remoteOnlyBranches,
  shortSha,
  type GitTab,
} from "./format";

type Operation = Infer<typeof projectOperation>;
type Project = Pick<Doc<"projects">, "_id" | "name" | "localPath">;
type Status = Extract<Infer<typeof operationResult>, { kind: "status" }>;

export function GitWorkspace({ project }: { project: Project }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const { width } = useWindowDimensions();
  const wide = width >= 1000;
  const rows = useQuery(api.projectOperations.list, { projectId: project._id });
  const enqueue = useMutation(api.projectOperations.enqueue);
  const [tab, setTab] = useState<GitTab>("changes");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<string | null>(null);
  const [diffId, setDiffId] = useState<Id<"projectOperations"> | null>(null);
  const [pending, setPending] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [switchToBranch, setSwitchToBranch] = useState(true);
  const [worktreeName, setWorktreeName] = useState("");
  const [worktreeBranch, setWorktreeBranch] = useState("");
  const [worktreeCreateBranch, setWorktreeCreateBranch] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const snapshot = rows?.find(
    (row) => row.operation.kind === "status" && row.result?.kind === "status",
  );
  const git: Status | undefined =
    snapshot?.result?.kind === "status" ? snapshot.result : undefined;
  const diff = rows?.find((row) => row._id === diffId);
  const active = rows?.find(
    (row) => row.state === "queued" || row.state === "running",
  );
  const latestStatus = rows?.find((row) => row.operation.kind === "status");
  const notice = rows?.find(
    (row) =>
      row.operation.kind !== "status" &&
      row.operation.kind !== "diff" &&
      row.operation.kind !== "terminal",
  );
  const selected = git?.files.filter((item) => !excluded.has(item.path)) ?? [];
  const locals = localBranches(git?.branches ?? []);
  const remotes = remoteOnlyBranches(git?.branches ?? []);
  const hasRemote = (git?.remotes?.length ?? 0) > 0;
  const busy = pending || !!active;
  const bottomPad = dockedBottomPad({
    keyboardHeight: keyboard,
    insetBottom: insets.bottom,
    platform: Platform.OS,
    gap: Platform.OS === "ios" ? 16 : 8,
  });

  async function run(operation: Operation, failed: string) {
    setError("");
    try {
      await enqueue({ projectId: project._id, operation });
      if (operation.kind !== "status" && operation.kind !== "diff")
        await enqueue({ projectId: project._id, operation: { kind: "status" } });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : failed);
      return false;
    }
  }
  async function act(operation: Operation, failed: string) {
    if (busy) return false;
    setPending(true);
    try {
      return await run(operation, failed);
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    void run({ kind: "status" }, "Could not read this repository.");
  }, [project._id]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (!active) void run({ kind: "status" }, "Could not read this repository.");
    }, 15_000);
    return () => clearInterval(timer);
  }, [project._id, active?._id]);
  useEffect(() => {
    if (file && git && !git.files.some((item) => item.path === file)) {
      setFile(null);
      setDiffId(null);
    }
  }, [file, git]);

  const inputStyle = [
    styles.input,
    {
      color: theme.text,
      backgroundColor: theme.backgroundElement,
      borderColor: theme.line,
    },
  ];

  async function openDiff(path: string) {
    setFile(path);
    setDiffId(null);
    await run({ kind: "diff", path }, "Could not load diff.");
  }

  const count = useMemo(
    () => ({
      changes: git?.files.length ?? 0,
      branches: git?.branches?.length ?? 0,
      worktrees: git?.worktrees?.length ?? 0,
      history: git?.commits?.length ?? 0,
    }),
    [git],
  );

  return (
    <View style={[styles.root, { paddingBottom: tab === "changes" ? bottomPad : 0 }]}>
      <View style={[styles.project, { borderColor: theme.line }]}>
        <Text style={[styles.title, { color: theme.text }]}>{project.name}</Text>
        <Text
          numberOfLines={1}
          selectable
          style={{ color: theme.textSecondary, fontSize: 12, flexShrink: 1 }}
        >
          {project.localPath}
        </Text>
        <Action
          icon="refresh"
          label="Refresh"
          compact
          disabled={busy}
          onPress={() => void run({ kind: "status" }, "Could not read this repository.")}
        />
      </View>
      <View style={[styles.summary, { borderColor: theme.line }]}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text selectable style={[styles.branch, { color: theme.text }]}>
            {git?.branch ?? "Reading repository…"}
          </Text>
          {git?.head ? (
            <Text
              selectable
              style={{
                color: theme.textSecondary,
                fontSize: 12,
                fontFamily: Fonts.mono,
                fontVariant: ["tabular-nums"],
              }}
            >
              {shortSha(git.head)}
              {git.upstream ? ` · ${git.upstream}` : ""}
              {` · ${formatAheadBehind(git)}`}
            </Text>
          ) : git ? (
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              {formatAheadBehind(git)}
            </Text>
          ) : null}
        </View>
        {hasRemote ? (
          <View style={styles.remoteActions}>
            <Action
              label="Fetch"
              disabled={busy}
              onPress={() => void act({ kind: "fetch" }, "Fetch failed.")}
            />
            <Action
              label="Pull"
              disabled={busy}
              onPress={() => void act({ kind: "pull" }, "Pull failed.")}
            />
            <Action
              label="Push"
              disabled={busy}
              onPress={() => void act({ kind: "push" }, "Push failed.")}
            />
          </View>
        ) : null}
      </View>
      <View style={[styles.tabs, { borderColor: theme.line }]}>
        {GIT_TABS.map((item) => {
          const selectedTab = tab === item.id;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected: selectedTab }}
              onPress={() => {
                setTab(item.id);
                if (item.id !== "changes") setFile(null);
              }}
              style={[
                styles.tab,
                selectedTab && { backgroundColor: theme.backgroundSelected },
              ]}
            >
              <Text
                style={{
                  color: selectedTab ? theme.text : theme.textSecondary,
                  fontSize: 13,
                  fontWeight: "500",
                }}
              >
                {item.label}
              </Text>
              <Text
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {count[item.id]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Notice text={error} error /> : null}
      {latestStatus?.error ? <Notice text={latestStatus.error} error /> : null}
      {notice?.error ? <Notice text={notice.error} error /> : null}
      {notice?.state === "done" && notice.result?.kind === "text" ? (
        <Notice text={notice.result.text} />
      ) : null}
      {tab === "changes" && file && !wide ? (
        <DiffPane
          file={file}
          diff={diff}
          error={error}
          onBack={() => {
            setFile(null);
            setDiffId(null);
          }}
        />
      ) : tab === "changes" ? (
        <View style={styles.split}>
          <ScrollView
            style={styles.pane}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {git && !git.files.length ? (
              <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
                Working tree clean.
              </Text>
            ) : git ? (
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                {selected.length} of {git.files.length} files selected
              </Text>
            ) : (
              <ActivityIndicator color={theme.accent} />
            )}
            {git?.files.map((item) => (
              <FileRow
                key={item.path}
                item={item}
                checked={!excluded.has(item.path)}
                active={file === item.path}
                onToggle={() =>
                  setExcluded((previous) => {
                    const next = new Set(previous);
                    next.has(item.path)
                      ? next.delete(item.path)
                      : next.add(item.path);
                    return next;
                  })
                }
                onOpen={() => void openDiff(item.path)}
              />
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
                  disabled={busy || !message.trim() || !selected.length}
                  onPress={() => {
                    void act(
                      {
                        kind: "commit",
                        message: message.trim(),
                        paths: selected.map((item) => item.path),
                        expectedBranch: git?.branch,
                      },
                      "Commit failed.",
                    ).then((ok) => {
                      if (ok) setMessage("");
                    });
                  }}
                />
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  Commits selected files on {git.branch}. Push separately.
                </Text>
              </View>
            )}
          </ScrollView>
          {wide ? (
            <View style={[styles.diffPane, { borderColor: theme.line }]}>
              {file ? (
                <DiffPane file={file} diff={diff} error={error} />
              ) : (
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 14,
                    padding: 20,
                  }}
                >
                  Select a file to read its diff.
                </Text>
              )}
            </View>
          ) : null}
        </View>
      ) : tab === "branches" ? (
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.section, { color: theme.textSecondary }]}>
            New branch
          </Text>
          <TextInput
            accessibilityLabel="New branch name"
            placeholder="branch-name"
            placeholderTextColor={theme.textSecondary}
            value={branchName}
            onChangeText={setBranchName}
            autoCapitalize="none"
            autoCorrect={false}
            style={inputStyle}
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Switch to this branch"
            accessibilityState={{ checked: switchToBranch }}
            onPress={() => setSwitchToBranch((value) => !value)}
            style={styles.checkRow}
          >
            <Check on={switchToBranch} />
            <Text style={{ color: theme.text, fontSize: 14 }}>
              Switch to this branch
            </Text>
          </Pressable>
          <Action
            icon="add"
            label={switchToBranch ? "Create and switch" : "Create branch"}
            selected
            disabled={busy || !branchName.trim()}
            onPress={() => {
              const name = branchName.trim();
              void act(
                { kind: "createBranch", name, checkout: switchToBranch },
                "Could not create branch.",
              ).then((ok) => {
                if (ok) setBranchName("");
              });
            }}
          />
          <Text style={[styles.section, { color: theme.textSecondary }]}>
            This checkout
          </Text>
          {locals.map((item) => (
            <BranchRow
              key={item.name}
              name={item.name}
              detail={formatAheadBehind(item)}
              current={item.current}
              extra={item.worktreePath && !item.current ? item.worktreePath : undefined}
              disabled={busy || item.current}
              onPress={() =>
                void act(
                  { kind: "checkout", branch: item.name },
                  "Could not switch branches.",
                )
              }
            />
          ))}
          {remotes.length ? (
            <Text style={[styles.section, { color: theme.textSecondary }]}>
              Remote only
            </Text>
          ) : null}
          {remotes.map((item) => (
            <BranchRow
              key={item.name}
              name={item.name}
              detail="Checkout creates a local branch"
              current={false}
              disabled={busy}
              onPress={() =>
                void act(
                  { kind: "checkout", branch: item.name },
                  "Could not switch branches.",
                )
              }
            />
          ))}
        </ScrollView>
      ) : tab === "worktrees" ? (
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.section, { color: theme.textSecondary }]}>
            Add worktree
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
            Creates a sibling folder named {project.name}-
            {worktreeName.trim() || "name"}.
          </Text>
          <TextInput
            accessibilityLabel="Worktree name"
            placeholder="name"
            placeholderTextColor={theme.textSecondary}
            value={worktreeName}
            onChangeText={(value) => {
              setWorktreeName(value);
              if (worktreeCreateBranch && worktreeBranch === worktreeName)
                setWorktreeBranch(value);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            style={inputStyle}
          />
          <TextInput
            accessibilityLabel="Worktree branch"
            placeholder="branch"
            placeholderTextColor={theme.textSecondary}
            value={worktreeBranch}
            onChangeText={setWorktreeBranch}
            autoCapitalize="none"
            autoCorrect={false}
            style={inputStyle}
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityLabel="Create this branch"
            accessibilityState={{ checked: worktreeCreateBranch }}
            onPress={() => setWorktreeCreateBranch((value) => !value)}
            style={styles.checkRow}
          >
            <Check on={worktreeCreateBranch} />
            <Text style={{ color: theme.text, fontSize: 14 }}>
              Create this branch
            </Text>
          </Pressable>
          <Action
            icon="add"
            label="Add worktree"
            selected
            disabled={busy || !worktreeName.trim() || !worktreeBranch.trim()}
            onPress={() => {
              const name = worktreeName.trim();
              const branch = worktreeBranch.trim();
              void act(
                {
                  kind: "createWorktree",
                  name,
                  branch,
                  createBranch: worktreeCreateBranch,
                },
                "Could not add worktree.",
              ).then((ok) => {
                if (ok) {
                  setWorktreeName("");
                  setWorktreeBranch("");
                }
              });
            }}
          />
          {(git?.worktrees ?? []).map((item) => (
            <View
              key={item.path}
              style={[styles.card, { borderColor: theme.line }]}
            >
              <Text selectable style={[styles.cardTitle, { color: theme.text }]}>
                {item.branch ?? "Detached HEAD"}
              </Text>
              <Text
                selectable
                numberOfLines={2}
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  fontFamily: Fonts.mono,
                }}
              >
                {item.path}
              </Text>
              <Text
                selectable
                style={{
                  color: theme.textSecondary,
                  fontSize: 12,
                  fontFamily: Fonts.mono,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {item.head ? shortSha(item.head) : "no HEAD"}
                {item.current ? " · this Project" : ""}
                {item.locked ? " · locked" : ""}
                {item.prunable ? " · prunable" : ""}
              </Text>
              {item.current ? null : removing === item.path ? (
                <View style={styles.confirm}>
                  <Action label="Cancel" onPress={() => setRemoving(null)} />
                  <Action
                    label="Remove worktree"
                    disabled={busy}
                    onPress={() => {
                      setRemoving(null);
                      void act(
                        { kind: "removeWorktree", path: item.path },
                        "Could not remove worktree.",
                      );
                    }}
                  />
                </View>
              ) : (
                <Action
                  label="Remove"
                  disabled={busy}
                  onPress={() => setRemoving(item.path)}
                />
              )}
            </View>
          ))}
          {git?.worktrees?.length === 1 ? (
            <Text style={{ color: theme.textSecondary, fontSize: 13, lineHeight: 18 }}>
              Only this checkout. Add a worktree to keep another branch in a
              separate folder.
            </Text>
          ) : null}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {(git?.commits ?? []).map((item) => (
            <View
              key={item.sha}
              style={[styles.commitRow, { borderColor: theme.line }]}
            >
              <Text
                selectable
                style={{
                  color: theme.accent,
                  fontFamily: Fonts.mono,
                  fontSize: 12,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {shortSha(item.sha)}
              </Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text selectable style={{ color: theme.text, fontSize: 14 }}>
                  {item.subject}
                </Text>
                <Text
                  style={{
                    color: theme.textSecondary,
                    fontSize: 12,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {item.author} · {formatCommitAge(item.committedAt, Date.now())}
                </Text>
              </View>
            </View>
          ))}
          {git && !git.commits?.length ? (
            <Text style={{ color: theme.textSecondary, fontSize: 14 }}>
              No commits yet.
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function FileRow({
  item,
  checked,
  active,
  onToggle,
  onOpen,
}: {
  item: { path: string; status: string; originalPath?: string };
  checked: boolean;
  active: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const tone = formatFileStatus(item.status);
  const color =
    tone.tone === "danger"
      ? theme.danger
      : tone.tone === "success"
        ? theme.success
        : theme.textSecondary;
  return (
    <View
      style={[
        styles.file,
        {
          borderColor: theme.line,
          backgroundColor: active ? theme.backgroundSelected : "transparent",
        },
      ]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`Include ${item.path}`}
        accessibilityState={{ checked }}
        onPress={onToggle}
        style={styles.checkbox}
      >
        <Check on={checked} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View diff for ${item.path}`}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.filename,
          pressed && { backgroundColor: theme.subtleHover },
        ]}
      >
        <Text
          numberOfLines={2}
          style={{ color: theme.text, fontFamily: Fonts.mono, fontSize: 12 }}
        >
          {item.originalPath ? `${item.originalPath} → ${item.path}` : item.path}
        </Text>
      </Pressable>
      <Text
        style={{
          color,
          fontFamily: Fonts.mono,
          fontSize: 12,
          paddingRight: 8,
        }}
      >
        {tone.label}
      </Text>
    </View>
  );
}

function BranchRow({
  name,
  detail,
  current,
  extra,
  disabled,
  onPress,
}: {
  name: string;
  detail: string;
  current: boolean;
  extra?: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        current ? `${name}, current branch` : `Switch to ${name}`
      }
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          borderColor: theme.line,
          backgroundColor:
            current || pressed ? theme.backgroundSelected : "transparent",
        },
      ]}
    >
      <View style={styles.branchHead}>
        <Text selectable style={[styles.cardTitle, { color: theme.text }]}>
          {name}
        </Text>
        {current ? (
          <Text style={{ color: theme.accent, fontSize: 12, fontWeight: "600" }}>
            Current
          </Text>
        ) : null}
      </View>
      <Text
        style={{
          color: theme.textSecondary,
          fontSize: 12,
          fontVariant: ["tabular-nums"],
        }}
      >
        {detail}
      </Text>
      {extra ? (
        <Text
          numberOfLines={1}
          selectable
          style={{
            color: theme.textSecondary,
            fontSize: 12,
            fontFamily: Fonts.mono,
          }}
        >
          {extra}
        </Text>
      ) : null}
    </Pressable>
  );
}

function DiffPane({
  file,
  diff,
  error,
  onBack,
}: {
  file: string;
  diff?: Doc<"projectOperations">;
  error: string;
  onBack?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.root}>
      <View style={[styles.diffHeader, { borderColor: theme.line }]}>
        {onBack ? (
          <Action icon="back" label="Changed files" compact onPress={onBack} />
        ) : null}
        <Text
          numberOfLines={1}
          selectable
          style={[styles.title, { color: theme.text, flex: 1 }]}
        >
          {file}
        </Text>
      </View>
      <ScrollView>
        <ScrollView contentContainerStyle={styles.diff} horizontal>
          <View>
            {!diff && !error ? <ActivityIndicator color={theme.accent} /> : null}
            {diff?.state === "queued" || diff?.state === "running" ? (
              <Notice text="Loading diff…" />
            ) : null}
            {diff?.error ? <Notice text={diff.error} error /> : null}
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
    </View>
  );
}

function Check({ on }: { on: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.check,
        {
          borderColor: on ? theme.accent : theme.lineStrong,
          backgroundColor: on ? theme.backgroundSelected : "transparent",
        },
      ]}
    >
      <Text style={{ color: theme.accent, fontSize: 11 }}>{on ? "✓" : ""}</Text>
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
  summary: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  branch: { fontSize: 18, fontWeight: "600", letterSpacing: -0.2 },
  remoteActions: { flexDirection: "row", flexWrap: "wrap" },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  tab: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  split: { flex: 1, minHeight: 0, flexDirection: "row" },
  pane: { flex: 1, minWidth: 0 },
  diffPane: { flex: 1, minWidth: 0, borderLeftWidth: 1 },
  body: { padding: 20, gap: 12, paddingBottom: 40 },
  section: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginTop: 8,
  },
  file: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    minHeight: 52,
    borderRadius: 8,
    borderCurve: "continuous",
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
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: "continuous",
    fontSize: 14,
    textAlignVertical: "top",
  },
  commit: { gap: 10, marginTop: 12 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: "continuous",
    padding: 14,
    gap: 6,
  },
  cardTitle: { fontSize: 15, fontWeight: "600" },
  branchHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  checkRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  confirm: { flexDirection: "row", flexWrap: "wrap" },
  commitRow: {
    borderBottomWidth: 1,
    paddingVertical: 12,
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  diffHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderBottomWidth: 1,
    gap: 4,
  },
  diff: { padding: 16 },
});
