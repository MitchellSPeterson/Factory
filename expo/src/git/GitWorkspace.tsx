import { useMutation, useQuery } from "@/lib/factory";
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from "react";
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
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Doc } from "@/lib/dataModel";
import type {
  GitBranch,
  GitFile,
  OperationResult,
  ProjectOperation,
} from "../../../shared/projectOperations";
import { api } from "@/lib/api";
import { dockedBottomPad } from "@/lib/keyboardInset";
import { Fonts } from "@/constants/theme";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
import { useTheme } from "@/hooks/use-theme";
import { Action } from "@/chats/ui";
import {
  describeSync,
  formatAheadBehind,
  formatCommitAge,
  formatFileStatus,
  GIT_TABS,
  localBranches,
  parseDiff,
  plural,
  remoteOnlyBranches,
  shortSha,
  splitPath,
  type FileTone,
  type GitTab,
} from "./format";

type Operation = ProjectOperation;
type Project = Pick<Doc<"projects">, "_id" | "name" | "localPath">;
type Status = Extract<OperationResult, { kind: "status" }>;
type Row = Doc<"projectOperations">;

const RUNNING: Partial<Record<Operation["kind"], string>> = {
  commit: "Committing…",
  checkout: "Switching branch…",
  createBranch: "Creating branch…",
  createWorktree: "Adding worktree…",
  removeWorktree: "Removing worktree…",
  fetch: "Fetching…",
  pull: "Pulling…",
  push: "Pushing…",
};
const DONE: Partial<Record<Operation["kind"], string>> = {
  commit: "Committed",
  checkout: "Switched branch",
  createBranch: "Branch created",
  createWorktree: "Worktree added",
  removeWorktree: "Worktree removed",
  fetch: "Fetched",
  pull: "Pulled",
  push: "Pushed",
};

/** `compact` forces the single-column layout, e.g. inside a chat's side panel. */
export function GitWorkspace({ project, compact }: { project: Project; compact?: boolean }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardHeight();
  const { width } = useWindowDimensions();
  const wide = !compact && width >= 1000;
  const rows = useQuery(api.projectOperations.list, { projectId: project._id });
  const enqueue = useMutation(api.projectOperations.enqueue);
  const [openedAt] = useState(() => Date.now());
  const [tab, setTab] = useState<GitTab>("changes");
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const snapshot = rows?.find(
    (row) => row.operation.kind === "status" && row.result?.kind === "status",
  );
  const git: Status | undefined =
    snapshot?.result?.kind === "status" ? snapshot.result : undefined;
  const active = rows?.find(
    (row) => row.state === "queued" || row.state === "running",
  );
  const latestStatus = rows?.find((row) => row.operation.kind === "status");
  // Only results from this visit; an old push output is noise.
  const notice = rows?.find(
    (row) =>
      row.operation.kind in DONE &&
      row._creationTime >= openedAt - 5_000 &&
      row._id !== dismissed,
  );
  const files = git?.files ?? [];
  const selected = files.filter((item) => !excluded.has(item.path));
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
    if (file && git && !git.files.some((item) => item.path === file))
      setFile(null);
  }, [file, git]);

  function openDiff(path: string) {
    setFile(path);
    void run({ kind: "diff", path }, "Could not load diff.");
  }
  // Rows are newest first, so this is the diff just requested (or the last one while it loads).
  const shownDiff = rows?.find(
    (row) => row.operation.kind === "diff" && row.operation.path === file,
  );

  const sync = git ? describeSync(git, files.length > 0) : undefined;
  const badge: Partial<Record<GitTab, number>> = {
    changes: files.length || undefined,
  };

  const banner = error ? (
    <Banner tone="danger" text={error} onClose={() => setError("")} />
  ) : active && RUNNING[active.operation.kind] ? (
    <Banner tone="busy" text={RUNNING[active.operation.kind]!} />
  ) : notice?.state === "failed" || notice?.error ? (
    <Banner
      tone="danger"
      text={notice.error ?? "That didn't work."}
      onClose={() => setDismissed(notice._id)}
    />
  ) : latestStatus?.error ? (
    <Banner tone="danger" text={latestStatus.error} />
  ) : notice?.state === "done" ? (
    <Banner
      tone="success"
      text={DONE[notice.operation.kind]!}
      detail={notice.result?.kind === "text" ? notice.result.text : undefined}
      onClose={() => setDismissed(notice._id)}
    />
  ) : null;

  const changes = (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {!git ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
        ) : !files.length ? (
          <Empty
            icon="done"
            title="Nothing to commit"
            body={
              sync?.action?.op === "push"
                ? `Your work is committed. ${sync.summary}`
                : "Your files match the last commit on this branch."
            }
          />
        ) : (
          <>
            <View style={styles.listHead}>
              <Text style={[styles.section, { color: theme.textSecondary }]}>
                {plural(files.length, "changed file")}
              </Text>
              <Pressable
                accessibilityRole="button"
                hitSlop={10}
                onPress={() =>
                  setExcluded(
                    selected.length === files.length
                      ? new Set(files.map((item) => item.path))
                      : new Set(),
                  )
                }
              >
                <Text style={{ color: theme.accent, fontSize: 13, fontWeight: "600" }}>
                  {selected.length === files.length ? "Deselect all" : "Select all"}
                </Text>
              </Pressable>
            </View>
            <View style={[styles.group, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}>
              {files.map((item, index) => (
                <FileRow
                  key={item.path}
                  item={item}
                  first={index === 0}
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
                  onOpen={() => openDiff(item.path)}
                />
              ))}
            </View>
            <Text style={[styles.hint, { color: theme.textSecondary }]}>
              Tap a file to see what changed. Uncheck files to leave them out of
              this commit.
            </Text>
          </>
        )}
      </ScrollView>
      {git && files.length ? (
        <View
          style={[
            styles.composer,
            {
              borderColor: theme.line,
              backgroundColor: theme.background,
              paddingBottom: wide ? 16 : bottomPad || 12,
            },
          ]}
        >
          <TextInput
            accessibilityLabel="Commit message"
            placeholder={`What did you change? (committing to ${git.branch})`}
            placeholderTextColor={theme.textSecondary}
            value={message}
            onChangeText={setMessage}
            multiline
            style={[
              styles.input,
              {
                color: theme.text,
                backgroundColor: theme.backgroundElement,
                borderColor: theme.line,
              },
            ]}
          />
          <View style={styles.composerRow}>
            <Text
              numberOfLines={2}
              style={[styles.hint, { color: theme.textSecondary, flex: 1 }]}
            >
              {!selected.length
                ? "Select at least one file."
                : !message.trim()
                  ? "Add a short message to commit."
                  : "Saved locally. Push to share it."}
            </Text>
            <Action
              icon="check"
              emphasis
              label={`Commit ${plural(selected.length, "file")}`}
              disabled={busy || !message.trim() || !selected.length}
              onPress={() => {
                void act(
                  {
                    kind: "commit",
                    message: message.trim(),
                    paths: selected.map((item) => item.path),
                    expectedBranch: git.branch,
                  },
                  "Commit failed.",
                ).then((ok) => {
                  if (ok) setMessage("");
                });
              }}
            />
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { borderColor: theme.line }]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text numberOfLines={1} style={[styles.eyebrow, { color: theme.textSecondary }]}>
              {project.name}
            </Text>
            <View style={styles.branchLine}>
              <SymbolView
                name={{ ios: "arrow.triangle.branch", android: "account_tree", web: "account_tree" }}
                size={17}
                tintColor={theme.accent}
              />
              <Text numberOfLines={1} selectable style={[styles.branch, { color: theme.text }]}>
                {git ? (git.detached ? `Detached at ${shortSha(git.head ?? "")}` : git.branch) : "Reading repository…"}
              </Text>
            </View>
          </View>
          <Action
            icon="refresh"
            label="Refresh"
            compact
            disabled={busy}
            onPress={() => void run({ kind: "status" }, "Could not read this repository.")}
          />
        </View>
        {sync ? (
          <View style={styles.syncRow}>
            <Text style={[styles.syncText, { color: theme.textSecondary }]}>
              {sync.action?.blocked ? `${sync.summary} ${sync.action.blocked}` : sync.summary}
            </Text>
            {sync.action ? (
              <Action
                emphasis={sync.action.op !== "fetch"}
                label={sync.action.label}
                disabled={busy || !!sync.action.blocked}
                onPress={() =>
                  void act(
                    { kind: sync.action!.op },
                    `${sync.action!.label} failed.`,
                  )
                }
              />
            ) : null}
          </View>
        ) : null}
        <View style={[styles.segment, { backgroundColor: theme.subtleHover }]}>
          {GIT_TABS.map((item) => {
            const on = tab === item.id;
            return (
              <Pressable
                key={item.id}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setTab(item.id);
                  if (item.id !== "changes") setFile(null);
                }}
                style={[
                  styles.segmentItem,
                  on && [styles.segmentOn, { backgroundColor: theme.backgroundElement }],
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    color: on ? theme.text : theme.textSecondary,
                    fontSize: 13,
                    fontWeight: on ? "600" : "500",
                  }}
                >
                  {item.label}
                </Text>
                {badge[item.id] ? (
                  <View style={[styles.badge, { backgroundColor: theme.accent }]}>
                    <Text style={styles.badgeText}>{badge[item.id]}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
      {banner}
      {tab === "changes" && file && !wide ? (
        <DiffPane
          file={file}
          diff={shownDiff}
          onBack={() => setFile(null)}
        />
      ) : tab === "changes" ? (
        wide ? (
          <View style={styles.split}>
            <View style={styles.pane}>{changes}</View>
            <View style={[styles.pane, styles.diffPane, { borderColor: theme.line }]}>
              {file ? (
                <DiffPane file={file} diff={shownDiff} />
              ) : (
                <Empty
                  icon="file"
                  title="No file selected"
                  body="Pick a file on the left to see its changes."
                />
              )}
            </View>
          </View>
        ) : (
          <View style={[styles.root, { paddingBottom: files.length ? 0 : bottomPad }]}>
            {changes}
          </View>
        )
      ) : tab === "branches" ? (
        <BranchesTab git={git} busy={busy} act={act} />
      ) : tab === "worktrees" ? (
        <WorktreesTab project={project} git={git} busy={busy} act={act} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {!git ? (
            <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
          ) : !git.commits?.length ? (
            <Empty
              icon="history"
              title="No commits yet"
              body="Your first commit will show up here."
            />
          ) : (
            <View style={[styles.group, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}>
              {git.commits.map((item, index) => (
                <View
                  key={item.sha}
                  style={[
                    styles.row,
                    index > 0 && { borderTopWidth: 1, borderColor: theme.line },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text selectable numberOfLines={2} style={{ color: theme.text, fontSize: 15 }}>
                      {item.subject}
                    </Text>
                    <Text style={[styles.meta, { color: theme.textSecondary }]}>
                      {item.author} · {formatCommitAge(item.committedAt, Date.now())}
                    </Text>
                  </View>
                  <Text selectable style={[styles.sha, { color: theme.textSecondary }]}>
                    {shortSha(item.sha)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

type Act = (operation: Operation, failed: string) => Promise<boolean>;

function BranchesTab({
  git,
  busy,
  act,
}: {
  git?: Status;
  busy: boolean;
  act: Act;
}) {
  const theme = useTheme();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [switchTo, setSwitchTo] = useState(true);
  const [query, setQuery] = useState("");
  const all = git?.branches ?? [];
  const match = (item: GitBranch) =>
    item.name.toLowerCase().includes(query.trim().toLowerCase());
  const locals = localBranches(all).filter(match);
  const remotes = remoteOnlyBranches(all).filter(match);
  const dirty = (git?.files.length ?? 0) > 0;

  function checkout(branch: string) {
    void act({ kind: "checkout", branch }, "Could not switch branches.");
  }

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {creating ? (
        <Card>
          <Text style={[styles.cardTitle, { color: theme.text }]}>New branch</Text>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Starts from {git?.branch ?? "the current commit"}.
          </Text>
          <Field
            label="Branch name"
            placeholder="feature/my-change"
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <Toggle label="Switch to it now" on={switchTo} onPress={() => setSwitchTo((v) => !v)} />
          <View style={styles.buttons}>
            <Action label="Cancel" onPress={() => setCreating(false)} />
            <Action
              emphasis
              label={switchTo ? "Create and switch" : "Create branch"}
              disabled={busy || !name.trim()}
              onPress={() =>
                void act(
                  { kind: "createBranch", name: name.trim(), checkout: switchTo },
                  "Could not create branch.",
                ).then((ok) => {
                  if (ok) {
                    setName("");
                    setCreating(false);
                  }
                })
              }
            />
          </View>
        </Card>
      ) : (
        <View style={styles.buttons}>
          <Action icon="add" label="New branch" onPress={() => setCreating(true)} />
        </View>
      )}
      {all.length > 8 ? (
        <Field label="Filter branches" placeholder="Filter branches" value={query} onChangeText={setQuery} />
      ) : null}
      {dirty ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          You have uncommitted changes. Git carries them over when you switch,
          unless they conflict.
        </Text>
      ) : null}
      {!git ? <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} /> : null}
      {locals.length ? (
        <>
          <Text style={[styles.section, { color: theme.textSecondary }]}>On this Mac</Text>
          <View style={[styles.group, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}>
            {locals.map((item, index) => {
              const elsewhere = !item.current && !!item.worktreePath;
              return (
                <View
                  key={item.name}
                  style={[
                    styles.row,
                    index > 0 && { borderTopWidth: 1, borderColor: theme.line },
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <View style={styles.branchLine}>
                      <Text selectable numberOfLines={1} style={[styles.rowTitle, { color: theme.text, flexShrink: 1 }]}>
                        {item.name}
                      </Text>
                      {item.current ? <Pill text="Current" color={theme.accent} /> : null}
                    </View>
                    <Text numberOfLines={1} style={[styles.meta, { color: theme.textSecondary }]}>
                      {elsewhere
                        ? `Open in another worktree`
                        : formatAheadBehind(item)}
                    </Text>
                  </View>
                  {item.current || elsewhere ? null : (
                    <Action label="Switch" disabled={busy} onPress={() => checkout(item.name)} />
                  )}
                </View>
              );
            })}
          </View>
        </>
      ) : null}
      {remotes.length ? (
        <>
          <Text style={[styles.section, { color: theme.textSecondary }]}>Only on remote</Text>
          <View style={[styles.group, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}>
            {remotes.map((item, index) => (
              <View
                key={item.name}
                style={[
                  styles.row,
                  index > 0 && { borderTopWidth: 1, borderColor: theme.line },
                ]}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <Text selectable numberOfLines={1} style={[styles.rowTitle, { color: theme.text }]}>
                    {item.name}
                  </Text>
                  <Text style={[styles.meta, { color: theme.textSecondary }]}>
                    Checking out makes a local copy
                  </Text>
                </View>
                <Action label="Check out" disabled={busy} onPress={() => checkout(item.name)} />
              </View>
            ))}
          </View>
        </>
      ) : null}
      {git && query && !locals.length && !remotes.length ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          No branches match “{query}”.
        </Text>
      ) : null}
    </ScrollView>
  );
}

function WorktreesTab({
  project,
  git,
  busy,
  act,
}: {
  project: Project;
  git?: Status;
  busy: boolean;
  act: Act;
}) {
  const theme = useTheme();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [newBranch, setNewBranch] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const worktrees = git?.worktrees ?? [];
  const folder = `${project.name}-${name.trim() || "name"}`;

  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        A worktree is a second folder with a different branch checked out, so
        you can work on two branches at once without switching.
      </Text>
      {adding ? (
        <Card>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Add worktree</Text>
          <Field
            label="Name"
            placeholder="e.g. hotfix"
            value={name}
            autoFocus
            onChangeText={(value) => {
              if (newBranch && branch === name) setBranch(value);
              setName(value);
            }}
          />
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            Folder: <Text style={{ fontFamily: Fonts.mono }}>../{folder}</Text>
          </Text>
          <Toggle
            label="Create a new branch"
            on={newBranch}
            onPress={() => setNewBranch((v) => !v)}
          />
          <Field
            label={newBranch ? "New branch name" : "Existing branch"}
            placeholder={newBranch ? "branch-name" : "main"}
            value={branch}
            onChangeText={setBranch}
          />
          <View style={styles.buttons}>
            <Action label="Cancel" onPress={() => setAdding(false)} />
            <Action
              emphasis
              label="Add worktree"
              disabled={busy || !name.trim() || !branch.trim()}
              onPress={() =>
                void act(
                  {
                    kind: "createWorktree",
                    name: name.trim(),
                    branch: branch.trim(),
                    createBranch: newBranch,
                  },
                  "Could not add worktree.",
                ).then((ok) => {
                  if (ok) {
                    setName("");
                    setBranch("");
                    setAdding(false);
                  }
                })
              }
            />
          </View>
        </Card>
      ) : (
        <View style={styles.buttons}>
          <Action icon="add" label="Add worktree" onPress={() => setAdding(true)} />
        </View>
      )}
      {!git ? <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} /> : null}
      {worktrees.length ? (
        <View style={[styles.group, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}>
          {worktrees.map((item, index) => (
            <View
              key={item.path}
              style={[
                styles.worktree,
                index > 0 && { borderTopWidth: 1, borderColor: theme.line },
              ]}
            >
              <View style={styles.row}>
                <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                  <View style={styles.branchLine}>
                    <Text selectable numberOfLines={1} style={[styles.rowTitle, { color: theme.text, flexShrink: 1 }]}>
                      {item.branch ?? "Detached HEAD"}
                    </Text>
                    {item.current ? <Pill text="This Project" color={theme.accent} /> : null}
                    {item.locked ? <Pill text="Locked" color={theme.textSecondary} /> : null}
                    {item.prunable ? <Pill text="Missing" color={theme.danger} /> : null}
                  </View>
                  <Text selectable numberOfLines={1} style={[styles.meta, { color: theme.textSecondary, fontFamily: Fonts.mono }]}>
                    {item.path}
                  </Text>
                </View>
                {item.current || removing === item.path ? null : (
                  <Action label="Remove" disabled={busy} onPress={() => setRemoving(item.path)} />
                )}
              </View>
              {removing === item.path ? (
                <View style={[styles.confirm, { backgroundColor: theme.subtleHover }]}>
                  <Text style={[styles.hint, { color: theme.text, flex: 1 }]}>
                    Delete this folder? Uncommitted work in it will stop the removal.
                  </Text>
                  <Action label="Cancel" onPress={() => setRemoving(null)} />
                  <Action
                    label="Remove"
                    emphasis
                    disabled={busy}
                    onPress={() => {
                      setRemoving(null);
                      void act({ kind: "removeWorktree", path: item.path }, "Could not remove worktree.");
                    }}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const TONE: Record<FileTone, "success" | "danger" | "accent" | "textSecondary"> = {
  success: "success",
  danger: "danger",
  accent: "accent",
  muted: "textSecondary",
};

function FileRow({
  item,
  first,
  checked,
  active,
  onToggle,
  onOpen,
}: {
  item: GitFile;
  first: boolean;
  checked: boolean;
  active: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const theme = useTheme();
  const status = formatFileStatus(item.status);
  const color = theme[TONE[status.tone]];
  const { name, dir } = splitPath(item.path);
  return (
    <View
      style={[
        styles.file,
        !first && { borderTopWidth: 1, borderColor: theme.line },
        active && { backgroundColor: theme.backgroundSelected },
      ]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`Include ${item.path} in commit`}
        accessibilityState={{ checked }}
        onPress={onToggle}
        style={styles.checkbox}
      >
        <Check on={checked} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${status.label}: ${item.path}. View changes`}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.fileMain,
          pressed && { backgroundColor: theme.subtleHover },
        ]}
      >
        <View style={[styles.letter, { borderColor: color }]}>
          <Text style={{ color, fontSize: 11, fontWeight: "700" }}>{status.letter}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontWeight: "500" }}>
            {name}
          </Text>
          <Text numberOfLines={1} style={[styles.meta, { color: theme.textSecondary }]}>
            {status.label}
            {item.originalPath ? ` from ${item.originalPath}` : dir ? ` · ${dir}` : ""}
          </Text>
        </View>
        <SymbolView
          name={{ ios: "chevron.right", android: "chevron_right", web: "chevron_right" }}
          size={13}
          tintColor={theme.textSecondary}
        />
      </Pressable>
    </View>
  );
}

function DiffPane({
  file,
  diff,
  onBack,
}: {
  file: string;
  diff?: Row;
  onBack?: () => void;
}) {
  const theme = useTheme();
  const parsed = useMemo(
    () => (diff?.result?.kind === "text" ? parseDiff(diff.result.text) : undefined),
    [diff?.result],
  );
  const { name, dir } = splitPath(file);
  const loading = !diff || diff.state === "queued" || diff.state === "running";
  return (
    <View style={styles.root}>
      <View style={[styles.diffHeader, { borderColor: theme.line }]}>
        {onBack ? (
          <Action icon="back" label="Back to changes" compact onPress={onBack} />
        ) : null}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} selectable style={[styles.rowTitle, { color: theme.text }]}>
            {name}
          </Text>
          {dir ? (
            <Text numberOfLines={1} style={[styles.meta, { color: theme.textSecondary }]}>
              {dir}
            </Text>
          ) : null}
        </View>
        {parsed ? (
          <Text style={[styles.sha, { color: theme.success }]}>
            +{parsed.added}{" "}
            <Text style={{ color: theme.danger }}>−{parsed.removed}</Text>
          </Text>
        ) : null}
      </View>
      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : diff?.error ? (
        <Text style={[styles.hint, { color: theme.danger, padding: 20 }]}>{diff.error}</Text>
      ) : parsed && !parsed.lines.some((line) => line.text) ? (
        <Empty icon="file" title="No text changes" body="This file changed in a way Git can't show as text." />
      ) : (
        <ScrollView>
          <ScrollView horizontal contentContainerStyle={styles.diff}>
            <View style={{ minWidth: "100%" }}>
              {parsed?.lines.map((line, i) => (
                <Text
                  selectable
                  key={i}
                  style={[
                    styles.diffLine,
                    line.kind === "add"
                      ? { color: theme.success, backgroundColor: "rgba(63, 185, 80, 0.12)" }
                      : line.kind === "del"
                        ? { color: theme.danger, backgroundColor: "rgba(248, 81, 73, 0.12)" }
                        : line.kind === "hunk"
                          ? { color: theme.accent, backgroundColor: theme.backgroundSelected, marginTop: i ? 12 : 0 }
                          : { color: theme.textSecondary },
                  ]}
                >
                  {line.text || " "}
                </Text>
              ))}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}

function Banner({
  tone,
  text,
  detail,
  onClose,
}: {
  tone: "danger" | "success" | "busy";
  text: string;
  detail?: string;
  onClose?: () => void;
}) {
  const theme = useTheme();
  const color =
    tone === "danger" ? theme.danger : tone === "success" ? theme.success : theme.accent;
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.banner, { borderColor: theme.line, backgroundColor: theme.subtleHover }]}
    >
      {tone === "busy" ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <SymbolView
          name={
            tone === "danger"
              ? { ios: "exclamationmark.triangle.fill", android: "warning", web: "warning" }
              : { ios: "checkmark.circle.fill", android: "check_circle", web: "check_circle" }
          }
          size={16}
          tintColor={color}
        />
      )}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text selectable style={{ color: tone === "danger" ? color : theme.text, fontSize: 14, fontWeight: "500" }}>
          {text}
        </Text>
        {detail ? (
          <Text selectable numberOfLines={3} style={[styles.meta, { color: theme.textSecondary, fontFamily: Fonts.mono }]}>
            {detail}
          </Text>
        ) : null}
      </View>
      {onClose ? <Action icon="close" label="Dismiss" compact onPress={onClose} /> : null}
    </View>
  );
}

type Symbol = ComponentProps<typeof SymbolView>["name"];
const EMPTY_ICONS = {
  done: { ios: "checkmark.circle", android: "check_circle", web: "check_circle" },
  file: { ios: "doc.text.magnifyingglass", android: "description", web: "description" },
  history: { ios: "clock", android: "schedule", web: "schedule" },
} satisfies Record<string, Symbol>;

function Empty({
  icon,
  title,
  body,
}: {
  icon: keyof typeof EMPTY_ICONS;
  title: string;
  body: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <SymbolView
        name={EMPTY_ICONS[icon]}
        size={32}
        tintColor={theme.textSecondary}
      />
      <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.hint, { color: theme.textSecondary, textAlign: "center" }]}>{body}</Text>
    </View>
  );
}

function Card({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { borderColor: theme.line, backgroundColor: theme.backgroundElement }]}>
      {children}
    </View>
  );
}

function Field({
  label,
  ...props
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  return (
    <TextInput
      accessibilityLabel={label}
      placeholderTextColor={theme.textSecondary}
      autoCapitalize="none"
      autoCorrect={false}
      style={[
        styles.input,
        styles.field,
        { color: theme.text, backgroundColor: theme.background, borderColor: theme.line },
      ]}
      {...props}
    />
  );
}

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={styles.toggle}
    >
      <Check on={on} />
      <Text style={{ color: theme.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

function Pill({ text, color }: { text: string; color: string }) {
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={{ color, fontSize: 11, fontWeight: "600" }}>{text}</Text>
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
          backgroundColor: on ? theme.accent : "transparent",
        },
      ]}
    >
      {on ? (
        <SymbolView
          name={{ ios: "checkmark", android: "check", web: "check" }}
          size={12}
          weight="bold"
          tintColor="#ffffff"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: 1,
  },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrow: { fontSize: 12, fontWeight: "500" },
  branchLine: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  branch: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3, flexShrink: 1 },
  syncRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  syncText: { flex: 1, fontSize: 13, lineHeight: 18 },
  segment: { flexDirection: "row", borderRadius: 10, borderCurve: "continuous", padding: 3 },
  segmentItem: {
    flex: 1,
    minHeight: 36,
    borderRadius: 8,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 4,
  },
  segmentOn: {
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.12)",
  },
  badge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#ffffff", fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"] },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 6,
    minHeight: 48,
    borderBottomWidth: 1,
  },
  split: { flex: 1, minHeight: 0, flexDirection: "row" },
  pane: { flex: 1, minWidth: 0 },
  diffPane: { borderLeftWidth: 1 },
  body: { padding: 16, gap: 12, paddingBottom: 40, maxWidth: 760, width: "100%", alignSelf: "center" },
  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  section: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 4,
  },
  hint: { fontSize: 13, lineHeight: 18 },
  meta: { fontSize: 12, fontVariant: ["tabular-nums"] },
  sha: { fontSize: 12, fontFamily: Fonts.mono, fontVariant: ["tabular-nums"] },
  group: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  rowTitle: { fontSize: 15, fontWeight: "600" },
  worktree: {},
  file: { flexDirection: "row", alignItems: "center", minHeight: 56 },
  checkbox: { alignSelf: "stretch", justifyContent: "center", paddingLeft: 14, paddingRight: 10 },
  fileMain: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingRight: 14,
  },
  letter: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    width: 20,
    height: 20,
    borderWidth: 1.5,
    borderRadius: 6,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  composer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
  },
  composerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  input: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: "continuous",
    fontSize: 15,
    textAlignVertical: "top",
  },
  field: { maxHeight: undefined },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: "continuous",
    padding: 16,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: "600" },
  buttons: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8 },
  toggle: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 },
  confirm: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginHorizontal: 10,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    borderCurve: "continuous",
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  empty: { alignItems: "center", gap: 8, paddingVertical: 48, paddingHorizontal: 24 },
  diffHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 56,
    borderBottomWidth: 1,
    gap: 8,
  },
  diff: { paddingVertical: 12 },
  diffLine: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    lineHeight: 20,
    paddingHorizontal: 16,
  },
});
