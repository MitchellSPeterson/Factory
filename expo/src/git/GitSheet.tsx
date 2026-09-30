import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";

import { BottomSheet } from "panelui-native/components/bottom-sheet";
import { Button } from "panelui-native/components/button";
import { Checkbox } from "panelui-native/components/checkbox";
import { CodeBlock } from "panelui-native/components/code-block";
import { EmptyState } from "panelui-native/components/empty-state";
import { Input } from "panelui-native/components/input";
import { Item } from "panelui-native/components/item";
import { Menu } from "panelui-native/components/menu";
import { Spinner } from "panelui-native/components/spinner";
import { Textarea } from "panelui-native/components/textarea";
import { CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, EllipsisIcon, RotateCwIcon, XIcon } from "panelui-native/icons";

import { useTheme } from "@/hooks/use-theme";
import { api } from "@/lib/api";
import type { Doc, Id } from "@/lib/dataModel";
import { useMutation } from "@/lib/factory";
import { useGitStatus } from "./useGitStatus";
import type { GitFile, OperationResult, ProjectOperation } from "../../../shared/projectOperations";
import {
  autoCommitMessage,
  formatFileStatus,
  localBranches,
  plural,
  remoteOnlyBranches,
} from "./format";

type Status = Extract<OperationResult, { kind: "status" }>;
type Row = Doc<"projectOperations">;
type Page = "home" | "commit" | "review" | "branches";

const RUNNING: Partial<Record<ProjectOperation["kind"], string>> = {
  commit: "Committing…",
  checkout: "Switching branch…",
  createBranch: "Creating branch…",
  createWorktree: "Creating worktree…",
  fetch: "Fetching…",
  pull: "Pulling…",
  push: "Pushing…",
  createPr: "Creating pull request…",
};
const DONE: Partial<Record<ProjectOperation["kind"], string>> = {
  commit: "Committed.",
  checkout: "Switched branch.",
  createBranch: "Branch created.",
  createWorktree: "Worktree created next to this Project.",
  fetch: "Fetched.",
  pull: "Pulled.",
  push: "Pushed.",
  createPr: "Pull request ready.",
};

const ICONS = {
  commit: { ios: "checkmark.circle", android: "check_circle", web: "check_circle" },
  push: { ios: "arrow.up", android: "arrow_upward", web: "arrow_upward" },
  pr: { ios: "arrow.triangle.pull", android: "call_merge", web: "call_merge" },
  review: { ios: "text.bubble", android: "rate_review", web: "rate_review" },
  branches: { ios: "arrow.triangle.branch", android: "account_tree", web: "account_tree" },
} as const;

/** Drops the git header noise before the first hunk, for `CodeBlock`'s own diff highlighting. */
function diffText(text: string) {
  const lines = text.replace(/\n$/, "").split("\n");
  const first = lines.findIndex((line) => line.startsWith("@@"));
  return (first > 0 ? lines.slice(first) : lines).join("\n");
}

/** T3-style git controls: a bottom sheet with Commit, Push, Create PR, Review, and Branches. */
export function GitSheet({
  project,
  visible,
  onClose,
}: {
  project: { _id: Id<"projects">; name: string };
  visible: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { rows, refresh: refreshStatus } = useGitStatus(project._id, visible);
  const enqueue = useMutation(api.projectOperations.enqueue);
  const [page, setPage] = useState<Page>("home");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [lastId, setLastId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const snapshot = rows?.find((row) => row.operation.kind === "status" && row.result?.kind === "status");
  const git = snapshot?.result?.kind === "status" ? snapshot.result : undefined;
  const files = git?.files ?? [];
  const selected = files.filter((item) => !excluded.has(item.path));
  const active = rows?.find((row) => row.state === "queued" || row.state === "running");
  const last = rows?.find((row) => row._id === lastId);
  const busy = pending || (!!active && active.operation.kind !== "status" && active.operation.kind !== "diff");

  async function refresh(force = false) {
    try {
      await refreshStatus(force);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this repository.");
    }
  }
  async function act(operation: ProjectOperation) {
    if (busy) return false;
    setPending(true);
    setError("");
    try {
      setLastId(await enqueue({ projectId: project._id, operation }));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
      return false;
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (!visible) {
      setPage("home");
      return;
    }
    void refresh();
  }, [visible, project._id]);
  // Re-read the repository once an action finishes, so every page reflects it.
  useEffect(() => {
    if (last?.state === "done" || last?.state === "failed") void refresh(true);
  }, [last?.state]);
  useEffect(() => {
    setExcluded((prev) => new Set([...prev].filter((path) => files.some((item) => item.path === path))));
  }, [git]);

  function back() {
    if (page === "home") onClose();
    else setPage("home");
  }
  function toggle(path: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  }

  const dirty = files.length > 0;
  const isDefault = !!git && !git.detached && git.branch === git.defaultBranch;
  const totals = sumCounts(selected);

  const title =
    page === "commit"
      ? "Commit changes"
      : page === "review"
        ? "Review changes"
        : page === "branches"
          ? "Branches & worktrees"
          : git
            ? git.detached
              ? "Detached HEAD"
              : git.branch
            : project.name;
  const subtitle =
    page === "home"
      ? git
        ? dirty
          ? `${plural(files.length, "file")} changed`
          : "No changes"
        : "Reading repository…"
      : page === "review"
        ? `${plural(files.length, "file")} · +${sumCounts(files).added} · −${sumCounts(files).removed}`
        : undefined;

  const push = pushState(git, dirty);
  const pr = prState(git, dirty, isDefault);

  return (
    <BottomSheet open={visible} onOpenChange={(open) => !open && onClose()}>
      <BottomSheet.Content size="full" showClose={false} className="px-0 pt-0">
        <View className="flex-row items-center gap-2 border-b border-border px-3 py-2.5">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={page === "home" ? "Close git controls" : "Back"}
            hitSlop={8}
            onPress={back}
            className="h-9 w-9 items-center justify-center rounded-full active:bg-accent">
            <ChevronLeftIcon size={18} className="text-foreground" />
          </Pressable>
          <View className="flex-1 gap-0.5">
            <Text numberOfLines={1} className="text-lg font-medium text-foreground">
              {title}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} className="text-sm text-muted-foreground">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {page === "home" ? (
            <Menu>
              <Menu.Trigger>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="More git actions"
                  hitSlop={8}
                  className="h-9 w-9 items-center justify-center rounded-full active:bg-accent">
                  <EllipsisIcon size={18} className="text-foreground" />
                </Pressable>
              </Menu.Trigger>
              <Menu.Content align="end">
                <Menu.Item icon={<RotateCwIcon size={16} />} onSelect={() => void refresh(true)}>
                  Refresh
                </Menu.Item>
                <Menu.Item icon={<RotateCwIcon size={16} />} disabled={busy} onSelect={() => void act({ kind: "fetch" })}>
                  Fetch
                </Menu.Item>
                <Menu.Item disabled={busy || dirty} onSelect={() => void act({ kind: "pull" })}>
                  {git?.behind ? `Pull ${git.behind}` : "Pull"}
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item
                  onSelect={() => {
                    onClose();
                    router.push("/git");
                  }}>
                  Open Git page
                </Menu.Item>
              </Menu.Content>
            </Menu>
          ) : null}
        </View>

        {error ? (
          <Banner tone="danger" text={error} onClose={() => setError("")} />
        ) : last && (last.state === "queued" || last.state === "running") ? (
          <Banner tone="busy" text={RUNNING[last.operation.kind] ?? "Working…"} />
        ) : last?.state === "failed" ? (
          <Banner tone="danger" text={last.error ?? "That didn't work."} onClose={() => setLastId(null)} />
        ) : last?.state === "done" && DONE[last.operation.kind] ? (
          <Banner
            tone="success"
            text={DONE[last.operation.kind]!}
            link={last.operation.kind === "createPr" && last.result?.kind === "text" ? last.result.text : undefined}
            onClose={() => setLastId(null)}
          />
        ) : null}

        {page === "home" ? (
          <BottomSheet.Body contentContainerClassName="gap-3 p-3 pb-6">
            <Item.Group className="overflow-hidden rounded-2xl border border-border">
              <ActionRow
                icon={ICONS.commit}
                title="Commit"
                subtitle={dirty ? `${plural(files.length, "file")} changed` : "No changes to commit"}
                disabled={!dirty || busy}
                onPress={() => setPage("commit")}
              />
              <Item.Separator />
              <ActionRow
                icon={ICONS.push}
                title={push.title}
                subtitle={push.subtitle}
                disabled={!push.enabled || busy}
                onPress={() => void act({ kind: "push" })}
              />
              <Item.Separator />
              <ActionRow
                icon={ICONS.pr}
                title="Create PR"
                subtitle={pr.subtitle}
                disabled={!pr.enabled || busy}
                onPress={() => void act({ kind: "createPr" })}
              />
              <Item.Separator />
              <ActionRow
                icon={ICONS.review}
                title="Review changes"
                subtitle={dirty ? "See what changed in each file" : "No changes to review"}
                disabled={!dirty}
                onPress={() => setPage("review")}
              />
              <Item.Separator />
              <ActionRow
                icon={ICONS.branches}
                title="Branches & worktrees"
                subtitle="Switch branch, create branch, or move to a worktree"
                onPress={() => setPage("branches")}
              />
            </Item.Group>
          </BottomSheet.Body>
        ) : page === "commit" && git ? (
          <CommitPage
            git={git}
            files={files}
            selected={selected}
            excluded={excluded}
            totals={totals}
            isDefault={isDefault}
            busy={busy}
            onToggle={toggle}
            onCommit={async (message, newBranch) => {
              const ok = await act({
                kind: "commit",
                message: message || autoCommitMessage(selected.map((item) => item.path)),
                paths: selected.map((item) => item.path),
                expectedBranch: git.branch,
                ...(newBranch ? { newBranch } : {}),
              });
              if (ok) setPage("home");
            }}
          />
        ) : page === "review" ? (
          <ReviewPage projectId={project._id} files={files} excluded={excluded} rows={rows ?? []} onToggle={toggle} />
        ) : page === "branches" ? (
          <BranchesPage git={git} busy={busy} act={act} />
        ) : (
          <View className="items-center py-8"><Spinner label="Loading changes" /></View>
        )}
      </BottomSheet.Content>
    </BottomSheet>
  );
}

function pushState(git: Status | undefined, dirty: boolean) {
  if (!git) return { title: "Push", subtitle: "Reading repository…", enabled: false };
  if (!git.remotes?.length) return { title: "Push", subtitle: "No remote is set up for this Project.", enabled: false };
  if (git.detached) return { title: "Push", subtitle: "Switch to a branch before pushing.", enabled: false };
  if (dirty) return { title: "Push", subtitle: "Commit or stash local changes before pushing.", enabled: false };
  if (git.gone || !git.upstream) return { title: "Publish branch", subtitle: "Push this branch to origin", enabled: true };
  if (git.ahead) return { title: "Push", subtitle: `${plural(git.ahead, "commit")} to push to ${git.upstream}`, enabled: true };
  return { title: "Push", subtitle: `Up to date with ${git.upstream}`, enabled: false };
}

function prState(git: Status | undefined, dirty: boolean, isDefault: boolean) {
  if (!git) return { subtitle: "Reading repository…", enabled: false };
  if (!git.remotes?.length) return { subtitle: "No remote is set up for this Project.", enabled: false };
  if (dirty) return { subtitle: "Commit local changes before creating a PR.", enabled: false };
  if (git.detached || isDefault) return { subtitle: "Switch to a feature branch to open a PR.", enabled: false };
  return { subtitle: `Push ${git.branch} and open a pull request on GitHub`, enabled: true };
}

function sumCounts(files: GitFile[]) {
  return files.reduce(
    (sum, item) => ({ added: sum.added + (item.added ?? 0), removed: sum.removed + (item.removed ?? 0) }),
    { added: 0, removed: 0 },
  );
}

function CommitPage({
  git,
  files,
  selected,
  excluded,
  totals,
  isDefault,
  busy,
  onToggle,
  onCommit,
}: {
  git: Status;
  files: GitFile[];
  selected: GitFile[];
  excluded: Set<string>;
  totals: { added: number; removed: number };
  isDefault: boolean;
  busy: boolean;
  onToggle: (path: string) => void;
  onCommit: (message: string, newBranch?: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [branchMode, setBranchMode] = useState(false);
  const [branch, setBranch] = useState("");
  const preview = editing ? files : selected.slice(0, 3);
  const canCommit = selected.length > 0 && !busy && (!branchMode || !!branch.trim());
  return (
    <>
      <BottomSheet.Body contentContainerClassName="gap-3 p-3 pb-6" keyboardShouldPersistTaps="handled">
        <View className="gap-2 rounded-2xl border border-border bg-card p-4">
          <Text className="text-sm text-muted-foreground">Branch</Text>
          <Text className="text-lg text-foreground">{branchMode && branch.trim() ? branch.trim() : git.branch}</Text>
          {isDefault && !branchMode ? (
            <Text className="text-sm text-warning">Warning: this is the default branch.</Text>
          ) : null}
          {branchMode ? (
            <Input
              accessibilityLabel="New branch name"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              placeholder="feature/my-change"
              value={branch}
              onChangeText={setBranch}
              className="mt-1"
            />
          ) : null}
        </View>

        <View className="gap-2 rounded-2xl border border-border bg-card p-4">
          <View className="flex-row items-center gap-3">
            <View className="flex-1 gap-0.5">
              <Text className="text-base font-medium text-foreground">Files</Text>
              <Text className="text-sm text-muted-foreground">
                {selected.length} selected · +{totals.added} / −{totals.removed}
              </Text>
            </View>
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setEditing((v) => !v)}>
              <Text className="text-sm font-semibold text-primary">{editing ? "Done" : "Edit"}</Text>
            </Pressable>
          </View>
          {preview.map((item) => (
            <Pressable
              key={item.path}
              accessibilityRole={editing ? "checkbox" : undefined}
              accessibilityState={editing ? { checked: !excluded.has(item.path) } : undefined}
              disabled={!editing}
              onPress={() => onToggle(item.path)}
              className="min-h-8 flex-row items-center gap-2.5">
              {editing ? <Check on={!excluded.has(item.path)} /> : null}
              <Text numberOfLines={1} ellipsizeMode="head" className="flex-1 text-sm text-foreground">
                {item.path}
              </Text>
              <Counts file={item} />
            </Pressable>
          ))}
          {!editing && selected.length > 3 ? (
            <Text className="text-sm text-muted-foreground">+{selected.length - 3} more files</Text>
          ) : null}
        </View>

        <View className="gap-2 rounded-2xl border border-border bg-card p-4">
          <Text className="text-base font-medium text-foreground">Commit message</Text>
          <Textarea
            accessibilityLabel="Commit message"
            placeholder="Leave empty to auto-generate"
            value={message}
            onChangeText={setMessage}
            rows={4}
          />
        </View>
      </BottomSheet.Body>
      <BottomSheet.Footer className="flex-row gap-2 px-3">
        <Button
          variant="secondary"
          className="flex-1"
          onPress={() => {
            setBranchMode((v) => !v);
            setBranch("");
          }}>
          {branchMode ? "Commit on current branch" : "Commit on new branch"}
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          disabled={!canCommit}
          onPress={() => void onCommit(message.trim(), branchMode ? branch.trim() : undefined)}>
          {branchMode ? "Create branch & commit" : "Commit"}
        </Button>
      </BottomSheet.Footer>
    </>
  );
}

function ReviewPage({
  projectId,
  files,
  excluded,
  rows,
  onToggle,
}: {
  projectId: Id<"projects">;
  files: GitFile[];
  excluded: Set<string>;
  rows: Row[];
  onToggle: (path: string) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(files[0] ? [files[0].path] : []));
  const enqueue = useMutation(api.projectOperations.enqueue);
  const loadDiff = (path: string) => void enqueue({ projectId, operation: { kind: "diff", path } }).catch(() => {});
  useEffect(() => {
    if (files[0]) loadDiff(files[0].path);
  }, [files[0]?.path]);
  return (
    <BottomSheet.Body contentContainerClassName="pb-8">
      {files.map((item) => {
        const expanded = open.has(item.path);
        const status = formatFileStatus(item.status);
        const diff = rows.find((row) => row.operation.kind === "diff" && row.operation.path === item.path);
        return (
          <View key={item.path} className="border-b border-border">
            <View className="min-h-14 flex-row items-center gap-2.5 pr-3.5">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${item.path}`}
                onPress={() => {
                  if (!expanded) loadDiff(item.path);
                  setOpen((prev) => {
                    const next = new Set(prev);
                    next.has(item.path) ? next.delete(item.path) : next.add(item.path);
                    return next;
                  });
                }}
                className="min-w-0 flex-1 flex-row items-center gap-2.5 py-3 pl-3.5">
                {expanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                <StatusTag status={status} />
                <Text numberOfLines={1} ellipsizeMode="head" className="flex-1 text-sm font-semibold text-foreground">
                  {item.path}
                </Text>
                <Counts file={item} reverse />
              </Pressable>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityLabel={`Include ${item.path} in commit`}
                accessibilityState={{ checked: !excluded.has(item.path) }}
                hitSlop={8}
                onPress={() => onToggle(item.path)}>
                <Check on={!excluded.has(item.path)} />
              </Pressable>
            </View>
            {expanded ? <DiffBlock diff={diff} /> : null}
          </View>
        );
      })}
    </BottomSheet.Body>
  );
}

function DiffBlock({ diff }: { diff?: Row }) {
  if (diff?.result?.kind !== "text") {
    return diff?.state === "failed" ? (
      <Text className="p-4 text-sm text-destructive">{diff.error}</Text>
    ) : (
      <View className="items-center py-4">
        <Spinner />
      </View>
    );
  }
  const text = diffText(diff.result.text);
  if (!text.split("\n").some((line) => !/^\s?$/.test(line.slice(1)) || /^[+-]/.test(line))) {
    return <Text className="p-4 text-sm text-muted-foreground">No text changes to show.</Text>;
  }
  return (
    <View className="px-3.5 pb-3">
      <CodeBlock code={text} language="diff" className="rounded-lg border-0 bg-transparent" />
    </View>
  );
}

function BranchesPage({
  git,
  busy,
  act,
}: {
  git?: Status;
  busy: boolean;
  act: (operation: ProjectOperation) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [base, setBase] = useState("");
  const [worktreeBranch, setWorktreeBranch] = useState("");
  const [query, setQuery] = useState("");
  const all = git?.branches ?? [];
  const match = (item: { name: string }) => item.name.toLowerCase().includes(query.trim().toLowerCase());
  // Current branch first, then the rest in Git's order.
  const locals = localBranches(all)
    .filter(match)
    .sort((a, b) => Number(b.current) - Number(a.current));
  const remotes = remoteOnlyBranches(all).filter(match);
  const baseBranch = base.trim() || (git && !git.detached ? git.branch : "");
  return (
    <BottomSheet.Body contentContainerClassName="gap-3 p-3 pb-6" keyboardShouldPersistTaps="handled">
      <View className="gap-2 rounded-2xl border border-border bg-card p-4">
        <Text className="text-base font-medium text-foreground">New branch</Text>
        <Input
          accessibilityLabel="New branch name"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="feature/my-change"
          value={name}
          onChangeText={setName}
        />
        <Button
          variant="secondary"
          disabled={busy || !name.trim()}
          onPress={() => void act({ kind: "createBranch", name: name.trim(), checkout: true }).then((ok) => ok && setName(""))}>
          Create & checkout
        </Button>
      </View>

      <View className="gap-2 rounded-2xl border border-border bg-card p-4">
        <Text className="text-base font-medium text-foreground">New worktree</Text>
        <Text className="text-sm text-muted-foreground">Base branch</Text>
        <Input
          accessibilityLabel="Base branch"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={baseBranch || "main"}
          value={base}
          onChangeText={setBase}
        />
        <Text className="text-sm text-muted-foreground">New branch</Text>
        <Input
          accessibilityLabel="Worktree branch name"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="feature/parallel-work"
          value={worktreeBranch}
          onChangeText={setWorktreeBranch}
        />
        <Button
          variant="secondary"
          disabled={busy || !worktreeBranch.trim()}
          onPress={() =>
            void act({
              kind: "createWorktree",
              // Folder name comes from the branch: feature/x → <project>-feature-x.
              name: worktreeBranch.trim().replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80),
              branch: worktreeBranch.trim(),
              createBranch: true,
              ...(baseBranch ? { base: baseBranch } : {}),
            }).then((ok) => ok && setWorktreeBranch(""))
          }>
          Create worktree
        </Button>
      </View>

      <Text className="mt-2 px-2 text-sm text-muted-foreground">Existing branches</Text>
      {all.length > 8 ? (
        <Input
          accessibilityLabel="Filter branches"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Filter branches"
          value={query}
          onChangeText={setQuery}
          variant="filled"
        />
      ) : null}
      {!git ? <Text className="text-sm text-muted-foreground">Loading branches…</Text> : null}
      {locals.length ? (
        <Item.Group className="overflow-hidden rounded-2xl border border-border">
          {locals.map((item, index) => {
            const elsewhere = !item.current && !!item.worktreePath;
            return (
              <BranchRow
                key={item.name}
                first={index === 0}
                name={item.name}
                detail={item.current ? "Current branch" : elsewhere ? "Checked out in another worktree" : "Local branch"}
                current={item.current}
                disabled={busy || item.current || elsewhere}
                onPress={() => void act({ kind: "checkout", branch: item.name })}
              />
            );
          })}
        </Item.Group>
      ) : null}
      {remotes.length ? (
        <Item.Group className="overflow-hidden rounded-2xl border border-border">
          {remotes.map((item, index) => (
            <BranchRow
              key={item.name}
              first={index === 0}
              name={item.name}
              detail="Remote branch · checking out makes a local copy"
              disabled={busy}
              onPress={() => void act({ kind: "checkout", branch: item.name })}
            />
          ))}
        </Item.Group>
      ) : null}
    </BottomSheet.Body>
  );
}

function BranchRow({
  name,
  detail,
  current,
  disabled,
  first,
  onPress,
}: {
  name: string;
  detail: string;
  current?: boolean;
  disabled: boolean;
  first: boolean;
  onPress: () => void;
}) {
  return (
    <>
      {first ? null : <Item.Separator />}
      <Item
        accessibilityLabel={`${name}, ${detail}`}
        disabled={disabled}
        onPress={disabled ? undefined : onPress}
        className={current ? undefined : "opacity-100"}>
        <Item.Content>
          <Item.Title numberOfLines={1}>{name}</Item.Title>
          <Item.Description numberOfLines={1}>{detail}</Item.Description>
        </Item.Content>
        {current ? (
          <Item.Actions>
            <CheckIcon size={16} />
          </Item.Actions>
        ) : null}
      </Item>
    </>
  );
}

function ActionRow({
  icon,
  title,
  subtitle,
  disabled,
  onPress,
}: {
  icon: (typeof ICONS)[keyof typeof ICONS];
  title: string;
  subtitle: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Item accessibilityLabel={`${title}. ${subtitle}`} disabled={disabled} onPress={disabled ? undefined : onPress} className="px-4 py-3.5">
      <Item.Media>
        <SymbolView name={icon} size={22} tintColor={theme.text} />
      </Item.Media>
      <Item.Content>
        <Item.Title>{title}</Item.Title>
        <Item.Description>{subtitle}</Item.Description>
      </Item.Content>
    </Item>
  );
}

function Counts({ file, reverse }: { file: GitFile; reverse?: boolean }) {
  if (file.added === undefined || file.removed === undefined) {
    const status = formatFileStatus(file.status);
    return <Text className="font-mono text-xs text-muted-foreground">{status.label}</Text>;
  }
  return (
    <Text className="font-mono text-xs">
      {reverse ? <Text className="text-destructive">−{file.removed}</Text> : <Text className="text-success">+{file.added}</Text>}
      {"  "}
      {reverse ? <Text className="text-success">+{file.added}</Text> : <Text className="text-destructive">−{file.removed}</Text>}
    </Text>
  );
}

function StatusTag({ status }: { status: ReturnType<typeof formatFileStatus> }) {
  const tone = status.tone === "danger" ? "text-destructive" : status.tone === "success" ? "text-success" : "text-foreground";
  return (
    <View className={`h-[22px] w-[22px] items-center justify-center rounded-md border-2 ${tone === "text-destructive" ? "border-destructive" : tone === "text-success" ? "border-success" : "border-foreground"}`}>
      <View className={`h-[7px] w-[7px] rounded-full ${tone === "text-destructive" ? "bg-destructive" : tone === "text-success" ? "bg-success" : "bg-foreground"}`} />
    </View>
  );
}

function Check({ on }: { on: boolean }) {
  return <Checkbox checked={on} />;
}

function Banner({
  tone,
  text,
  link,
  onClose,
}: {
  tone: "busy" | "success" | "danger";
  text: string;
  link?: string;
  onClose?: () => void;
}) {
  const color = tone === "danger" ? "text-destructive" : tone === "success" ? "text-success" : "text-muted-foreground";
  return (
    <View className="mx-3 mb-1 flex-row items-center gap-2.5 rounded-2xl bg-muted px-3.5 py-2.5">
      {tone === "busy" ? <Spinner size="sm" /> : null}
      <Text numberOfLines={4} className={`flex-1 text-sm ${color}`}>
        {text}
      </Text>
      {link ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(link)}>
          <Text className="text-sm font-semibold text-primary">Open</Text>
        </Pressable>
      ) : null}
      {onClose ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} onPress={onClose}>
          <XIcon size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}
