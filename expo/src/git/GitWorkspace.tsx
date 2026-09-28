import { useMutation, useQuery } from "@/lib/factory";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Badge } from "panelui-native/components/badge";
import { Button } from "panelui-native/components/button";
import { Checkbox } from "panelui-native/components/checkbox";
import { CodeBlock } from "panelui-native/components/code-block";
import { EmptyState } from "panelui-native/components/empty-state";
import { Input } from "panelui-native/components/input";
import { Item } from "panelui-native/components/item";
import { Spinner } from "panelui-native/components/spinner";
import { Tabs } from "panelui-native/components/tabs";
import { Textarea } from "panelui-native/components/textarea";
import { ChevronRightIcon, PlusIcon, RotateCwIcon, ShareNodesIcon, XIcon } from "panelui-native/icons";

import type { Doc } from "@/lib/dataModel";
import type { GitBranch, GitFile, OperationResult, ProjectOperation } from "../../../shared/projectOperations";
import { api } from "@/lib/api";
import { dockedBottomPad } from "@/lib/keyboardInset";
import { useKeyboardHeight } from "@/hooks/use-keyboard-height";
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

/** Drops the git header noise before the first hunk, for `CodeBlock`'s own diff highlighting. */
function diffText(text: string) {
  const lines = text.replace(/\n$/, "").split("\n");
  const first = lines.findIndex((line) => line.startsWith("@@"));
  return (first > 0 ? lines.slice(first) : lines).join("\n");
}

/** `compact` forces the single-column layout, e.g. inside a chat's side panel. */
export function GitWorkspace({ project, compact }: { project: Project; compact?: boolean }) {
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
    <View className="min-h-0 flex-1">
      <ScrollView
        className="min-h-0 flex-1"
        contentContainerClassName="gap-3 p-4 pb-10 max-w-[760px] w-full self-center"
        keyboardShouldPersistTaps="handled"
      >
        {!git ? (
          <View className="mt-10 items-center">
            <Spinner />
          </View>
        ) : !files.length ? (
          <EmptyState size="sm">
            <EmptyState.Header>
              <EmptyState.Title>Nothing to commit</EmptyState.Title>
              <EmptyState.Description>
                {sync?.action?.op === "push"
                  ? `Your work is committed. ${sync.summary}`
                  : "Your files match the last commit on this branch."}
              </EmptyState.Description>
            </EmptyState.Header>
          </EmptyState>
        ) : (
          <>
            <View className="flex-row items-center justify-between">
              <Text className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                <Text className="text-[13px] font-semibold text-primary">
                  {selected.length === files.length ? "Deselect all" : "Select all"}
                </Text>
              </Pressable>
            </View>
            <Item.Group className="overflow-hidden rounded-2xl border border-border bg-card">
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
            </Item.Group>
            <Text className="text-[13px] text-muted-foreground">
              Tap a file to see what changed. Uncheck files to leave them out of
              this commit.
            </Text>
          </>
        )}
      </ScrollView>
      {git && files.length ? (
        <View
          className="gap-2.5 border-t border-border bg-background px-4 pt-3"
          style={{ paddingBottom: wide ? 16 : bottomPad || 12 }}
        >
          <Textarea
            accessibilityLabel="Commit message"
            placeholder={`What did you change? (committing to ${git.branch})`}
            value={message}
            onChangeText={setMessage}
            rows={2}
            autoGrow
            maxRows={5}
          />
          <View className="flex-row items-center gap-3">
            <Text numberOfLines={2} className="flex-1 text-[13px] text-muted-foreground">
              {!selected.length
                ? "Select at least one file."
                : !message.trim()
                  ? "Add a short message to commit."
                  : "Saved locally. Push to share it."}
            </Text>
            <Button
              variant="primary"
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
            >
              Commit {plural(selected.length, "file")}
            </Button>
          </View>
        </View>
      ) : null}
    </View>
  );

  return (
    <View className="min-h-0 flex-1">
      <View className="gap-3 border-b border-border px-4 pb-3 pt-2">
        <View className="flex-row items-center gap-2">
          <View className="flex-1 min-w-0 gap-1">
            <Text numberOfLines={1} className="text-xs font-medium text-muted-foreground">
              {project.name}
            </Text>
            <View className="min-w-0 flex-row items-center gap-1.5">
              <ShareNodesIcon size={17} className="text-primary" />
              <Text numberOfLines={1} selectable className="shrink text-xl font-bold tracking-tight text-foreground">
                {git ? (git.detached ? `Detached at ${shortSha(git.head ?? "")}` : git.branch) : "Reading repository…"}
              </Text>
            </View>
          </View>
          <Button
            variant="ghost"
            size="icon"
            disabled={busy}
            accessibilityLabel="Refresh"
            onPress={() => void run({ kind: "status" }, "Could not read this repository.")}
          >
            <RotateCwIcon size={18} />
          </Button>
        </View>
        {sync ? (
          <View className="flex-row items-center gap-3">
            <Text className="flex-1 text-[13px] leading-[18px] text-muted-foreground">
              {sync.action?.blocked ? `${sync.summary} ${sync.action.blocked}` : sync.summary}
            </Text>
            {sync.action ? (
              <Button
                size="sm"
                variant={sync.action.op !== "fetch" ? "primary" : "secondary"}
                disabled={busy || !!sync.action.blocked}
                onPress={() => void act({ kind: sync.action!.op }, `${sync.action!.label} failed.`)}
              >
                {sync.action.label}
              </Button>
            ) : null}
          </View>
        ) : null}
        <Tabs
          value={tab}
          onValueChange={(value) => {
            setTab(value as GitTab);
            if (value !== "changes") setFile(null);
          }}
          defaultValue="changes"
        >
          <Tabs.List>
            {GIT_TABS.map((item) => (
              <Tabs.Trigger key={item.id} value={item.id} badge={badge[item.id] ? <Badge shape="count">{badge[item.id]}</Badge> : undefined}>
                {item.label}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs>
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
          <View className="min-h-0 flex-1 flex-row">
            <View className="min-w-0 flex-1">{changes}</View>
            <View className="min-w-0 flex-1 border-l border-border">
              {file ? (
                <DiffPane file={file} diff={shownDiff} />
              ) : (
                <EmptyState size="sm">
                  <EmptyState.Header>
                    <EmptyState.Title>No file selected</EmptyState.Title>
                    <EmptyState.Description>Pick a file on the left to see its changes.</EmptyState.Description>
                  </EmptyState.Header>
                </EmptyState>
              )}
            </View>
          </View>
        ) : (
          <View className="min-h-0 flex-1" style={{ paddingBottom: files.length ? 0 : bottomPad }}>
            {changes}
          </View>
        )
      ) : tab === "branches" ? (
        <BranchesTab git={git} busy={busy} act={act} />
      ) : tab === "worktrees" ? (
        <WorktreesTab project={project} git={git} busy={busy} act={act} />
      ) : (
        <ScrollView contentContainerClassName="gap-3 p-4 pb-10 max-w-[760px] w-full self-center">
          {!git ? (
            <View className="mt-10 items-center">
              <Spinner />
            </View>
          ) : !git.commits?.length ? (
            <EmptyState size="sm">
              <EmptyState.Header>
                <EmptyState.Title>No commits yet</EmptyState.Title>
                <EmptyState.Description>Your first commit will show up here.</EmptyState.Description>
              </EmptyState.Header>
            </EmptyState>
          ) : (
            <Item.Group className="overflow-hidden rounded-2xl border border-border bg-card">
              {git.commits.map((item, index) => (
                <View key={item.sha}>
                  {index > 0 ? <Item.Separator /> : null}
                  <View className="min-h-14 flex-row items-center gap-3 px-3.5 py-2.5">
                    <View className="flex-1 min-w-0 gap-0.5">
                      <Text selectable numberOfLines={2} className="text-[15px] text-foreground">
                        {item.subject}
                      </Text>
                      <Text className="text-xs text-muted-foreground">
                        {item.author} · {formatCommitAge(item.committedAt, Date.now())}
                      </Text>
                    </View>
                    <Text selectable className="font-mono text-xs tabular-nums text-muted-foreground">
                      {shortSha(item.sha)}
                    </Text>
                  </View>
                </View>
              ))}
            </Item.Group>
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
    <ScrollView contentContainerClassName="gap-3 p-4 pb-10 max-w-[760px] w-full self-center" keyboardShouldPersistTaps="handled">
      {creating ? (
        <View className="gap-2.5 rounded-2xl border border-border bg-card p-4">
          <Text className="text-base font-semibold text-foreground">New branch</Text>
          <Text className="text-[13px] text-muted-foreground">
            Starts from {git?.branch ?? "the current commit"}.
          </Text>
          <Input
            accessibilityLabel="Branch name"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            placeholder="feature/my-change"
            value={name}
            onChangeText={setName}
          />
          <Checkbox checked={switchTo} onCheckedChange={setSwitchTo} label="Switch to it now" />
          <View className="flex-row flex-wrap justify-end gap-2">
            <Button variant="ghost" onPress={() => setCreating(false)}>Cancel</Button>
            <Button
              variant="primary"
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
            >
              {switchTo ? "Create and switch" : "Create branch"}
            </Button>
          </View>
        </View>
      ) : (
        <View className="flex-row flex-wrap justify-end gap-2">
          <Button variant="secondary" startContent={<PlusIcon size={16} />} onPress={() => setCreating(true)}>
            New branch
          </Button>
        </View>
      )}
      {all.length > 8 ? (
        <Input accessibilityLabel="Filter branches" placeholder="Filter branches" value={query} onChangeText={setQuery} />
      ) : null}
      {dirty ? (
        <Text className="text-[13px] text-muted-foreground">
          You have uncommitted changes. Git carries them over when you switch,
          unless they conflict.
        </Text>
      ) : null}
      {!git ? (
        <View className="mt-10 items-center">
          <Spinner />
        </View>
      ) : null}
      {locals.length ? (
        <>
          <Text className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">On this Mac</Text>
          <Item.Group className="overflow-hidden rounded-2xl border border-border bg-card">
            {locals.map((item, index) => {
              const elsewhere = !item.current && !!item.worktreePath;
              return (
                <View key={item.name}>
                  {index > 0 ? <Item.Separator /> : null}
                  <View className="min-h-14 flex-row items-center gap-3 px-3.5 py-2.5">
                    <View className="flex-1 min-w-0 gap-0.5">
                      <View className="min-w-0 flex-row items-center gap-1.5">
                        <Text selectable numberOfLines={1} className="shrink text-[15px] font-semibold text-foreground">
                          {item.name}
                        </Text>
                        {item.current ? <Badge variant="outline">Current</Badge> : null}
                      </View>
                      <Text numberOfLines={1} className="text-xs text-muted-foreground">
                        {elsewhere ? "Open in another worktree" : formatAheadBehind(item)}
                      </Text>
                    </View>
                    {item.current || elsewhere ? null : (
                      <Button size="sm" variant="secondary" disabled={busy} onPress={() => checkout(item.name)}>
                        Switch
                      </Button>
                    )}
                  </View>
                </View>
              );
            })}
          </Item.Group>
        </>
      ) : null}
      {remotes.length ? (
        <>
          <Text className="mt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Only on remote</Text>
          <Item.Group className="overflow-hidden rounded-2xl border border-border bg-card">
            {remotes.map((item, index) => (
              <View key={item.name}>
                {index > 0 ? <Item.Separator /> : null}
                <View className="min-h-14 flex-row items-center gap-3 px-3.5 py-2.5">
                  <View className="flex-1 min-w-0 gap-0.5">
                    <Text selectable numberOfLines={1} className="text-[15px] font-semibold text-foreground">
                      {item.name}
                    </Text>
                    <Text className="text-xs text-muted-foreground">Checking out makes a local copy</Text>
                  </View>
                  <Button size="sm" variant="secondary" disabled={busy} onPress={() => checkout(item.name)}>
                    Check out
                  </Button>
                </View>
              </View>
            ))}
          </Item.Group>
        </>
      ) : null}
      {git && query && !locals.length && !remotes.length ? (
        <Text className="text-[13px] text-muted-foreground">No branches match “{query}”.</Text>
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
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [newBranch, setNewBranch] = useState(true);
  const [removing, setRemoving] = useState<string | null>(null);
  const worktrees = git?.worktrees ?? [];
  const folder = `${project.name}-${name.trim() || "name"}`;

  return (
    <ScrollView contentContainerClassName="gap-3 p-4 pb-10 max-w-[760px] w-full self-center" keyboardShouldPersistTaps="handled">
      <Text className="text-[13px] text-muted-foreground">
        A worktree is a second folder with a different branch checked out, so
        you can work on two branches at once without switching.
      </Text>
      {adding ? (
        <View className="gap-2.5 rounded-2xl border border-border bg-card p-4">
          <Text className="text-base font-semibold text-foreground">Add worktree</Text>
          <Input
            accessibilityLabel="Name"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. hotfix"
            value={name}
            autoFocus
            onChangeText={(value) => {
              if (newBranch && branch === name) setBranch(value);
              setName(value);
            }}
          />
          <Text className="text-[13px] text-muted-foreground">
            Folder: <Text className="font-mono">../{folder}</Text>
          </Text>
          <Checkbox checked={newBranch} onCheckedChange={setNewBranch} label="Create a new branch" />
          <Input
            accessibilityLabel={newBranch ? "New branch name" : "Existing branch"}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={newBranch ? "branch-name" : "main"}
            value={branch}
            onChangeText={setBranch}
          />
          <View className="flex-row flex-wrap justify-end gap-2">
            <Button variant="ghost" onPress={() => setAdding(false)}>Cancel</Button>
            <Button
              variant="primary"
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
            >
              Add worktree
            </Button>
          </View>
        </View>
      ) : (
        <View className="flex-row flex-wrap justify-end gap-2">
          <Button variant="secondary" startContent={<PlusIcon size={16} />} onPress={() => setAdding(true)}>
            Add worktree
          </Button>
        </View>
      )}
      {!git ? (
        <View className="mt-10 items-center">
          <Spinner />
        </View>
      ) : null}
      {worktrees.length ? (
        <Item.Group className="overflow-hidden rounded-2xl border border-border bg-card">
          {worktrees.map((item, index) => (
            <View key={item.path}>
              {index > 0 ? <Item.Separator /> : null}
              <View className="min-h-14 flex-row items-center gap-3 px-3.5 py-2.5">
                <View className="flex-1 min-w-0 gap-0.5">
                  <View className="min-w-0 flex-row items-center gap-1.5">
                    <Text selectable numberOfLines={1} className="shrink text-[15px] font-semibold text-foreground">
                      {item.branch ?? "Detached HEAD"}
                    </Text>
                    {item.current ? <Badge variant="outline">This Project</Badge> : null}
                    {item.locked ? <Badge variant="secondary">Locked</Badge> : null}
                    {item.prunable ? <Badge variant="destructive">Missing</Badge> : null}
                  </View>
                  <Text selectable numberOfLines={1} className="font-mono text-xs text-muted-foreground">
                    {item.path}
                  </Text>
                </View>
                {item.current || removing === item.path ? null : (
                  <Button size="sm" variant="secondary" disabled={busy} onPress={() => setRemoving(item.path)}>
                    Remove
                  </Button>
                )}
              </View>
              {removing === item.path ? (
                <View className="mx-2.5 mb-2.5 flex-row flex-wrap items-center gap-2 rounded-lg bg-accent p-2.5">
                  <Text className="flex-1 text-[13px] text-foreground">
                    Delete this folder? Uncommitted work in it will stop the removal.
                  </Text>
                  <Button variant="ghost" size="sm" onPress={() => setRemoving(null)}>Cancel</Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onPress={() => {
                      setRemoving(null);
                      void act({ kind: "removeWorktree", path: item.path }, "Could not remove worktree.");
                    }}
                  >
                    Remove
                  </Button>
                </View>
              ) : null}
            </View>
          ))}
        </Item.Group>
      ) : null}
    </ScrollView>
  );
}

const TONE: Record<FileTone, string> = {
  success: "text-success border-success",
  danger: "text-destructive border-destructive",
  accent: "text-primary border-primary",
  muted: "text-muted-foreground border-muted-foreground",
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
  const status = formatFileStatus(item.status);
  const tone = TONE[status.tone];
  const { name, dir } = splitPath(item.path);
  return (
    <View>
      {first ? null : <Item.Separator />}
      <View className={`min-h-14 flex-row items-center ${active ? "bg-accent" : ""}`}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`Include ${item.path} in commit`}
          accessibilityState={{ checked }}
          onPress={onToggle}
          className="items-center justify-center self-stretch pl-3.5 pr-2.5"
        >
          <Checkbox checked={checked} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${status.label}: ${item.path}. View changes`}
          onPress={onOpen}
          className="min-w-0 flex-1 flex-row items-center gap-2.5 self-stretch py-2.5 pr-3.5 active:bg-accent"
        >
          <View className={`h-[22px] w-[22px] items-center justify-center rounded-md border-[1.5px] ${tone}`}>
            <Text className={`text-[11px] font-bold ${tone}`}>{status.letter}</Text>
          </View>
          <View className="flex-1 min-w-0 gap-0.5">
            <Text numberOfLines={1} className="text-sm font-medium text-foreground">
              {name}
            </Text>
            <Text numberOfLines={1} className="text-xs text-muted-foreground">
              {status.label}
              {item.originalPath ? ` from ${item.originalPath}` : dir ? ` · ${dir}` : ""}
            </Text>
          </View>
          <ChevronRightIcon size={14} className="text-muted-foreground" />
        </Pressable>
      </View>
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
  const parsed = useMemo(
    () => (diff?.result?.kind === "text" ? parseDiff(diff.result.text) : undefined),
    [diff?.result],
  );
  const { name, dir } = splitPath(file);
  const loading = !diff || diff.state === "queued" || diff.state === "running";
  return (
    <View className="min-h-0 flex-1">
      <View className="min-h-14 flex-row items-center gap-2 border-b border-border px-3 py-2">
        {onBack ? (
          <Button variant="ghost" size="sm" onPress={onBack}>
            Back to changes
          </Button>
        ) : null}
        <View className="flex-1 min-w-0 gap-0.5">
          <Text numberOfLines={1} selectable className="text-[15px] font-semibold text-foreground">
            {name}
          </Text>
          {dir ? (
            <Text numberOfLines={1} className="text-xs text-muted-foreground">
              {dir}
            </Text>
          ) : null}
        </View>
        {parsed ? (
          <Text className="font-mono text-xs tabular-nums text-success">
            +{parsed.added} <Text className="text-destructive">−{parsed.removed}</Text>
          </Text>
        ) : null}
      </View>
      {loading ? (
        <View className="mt-10 items-center">
          <Spinner />
        </View>
      ) : diff?.error ? (
        <Text className="p-5 text-sm text-destructive">{diff.error}</Text>
      ) : diff?.result?.kind === "text" && !diffText(diff.result.text).split("\n").some((line) => !/^\s?$/.test(line.slice(1)) || /^[+-]/.test(line)) ? (
        <EmptyState size="sm">
          <EmptyState.Header>
            <EmptyState.Title>No text changes</EmptyState.Title>
            <EmptyState.Description>This file changed in a way Git can't show as text.</EmptyState.Description>
          </EmptyState.Header>
        </EmptyState>
      ) : diff?.result?.kind === "text" ? (
        <ScrollView contentContainerClassName="p-3">
          <CodeBlock code={diffText(diff.result.text)} language="diff" className="rounded-lg border-0 bg-transparent" />
        </ScrollView>
      ) : null}
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
  const color = tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : "text-foreground";
  return (
    <View
      accessibilityRole={tone === "danger" ? "alert" : undefined}
      accessibilityLiveRegion="polite"
      className="min-h-12 flex-row items-center gap-2.5 border-b border-border bg-accent py-1.5 pl-4 pr-1"
    >
      {tone === "busy" ? (
        <Spinner size="sm" />
      ) : (
        <SymbolView
          name={
            tone === "danger"
              ? { ios: "exclamationmark.triangle.fill", android: "warning", web: "warning" }
              : { ios: "checkmark.circle.fill", android: "check_circle", web: "check_circle" }
          }
          size={16}
        />
      )}
      <View className="flex-1 min-w-0 gap-0.5">
        <Text selectable className={`text-sm font-medium ${tone === "danger" ? color : "text-foreground"}`}>
          {text}
        </Text>
        {detail ? (
          <Text selectable numberOfLines={3} className="font-mono text-xs text-muted-foreground">
            {detail}
          </Text>
        ) : null}
      </View>
      {onClose ? (
        <Button variant="ghost" size="icon" accessibilityLabel="Dismiss" onPress={onClose}>
          <XIcon size={16} />
        </Button>
      ) : null}
    </View>
  );
}
