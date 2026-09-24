import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { IconButton } from "@/components/icon-button";
import { Sheet } from "@/devices/hub/controls";
import { sheetFillLayout } from "@/devices/hub/sheetLayout";
import { Fonts } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { api } from "@/lib/api";
import type { Doc, Id } from "@/lib/dataModel";
import { useMutation, useQuery } from "@/lib/factory";
import type { GitFile, OperationResult, ProjectOperation } from "../../../shared/projectOperations";
import {
  autoCommitMessage,
  formatFileStatus,
  localBranches,
  numberDiffLines,
  parseDiff,
  plural,
  remoteOnlyBranches,
} from "./format";

type Status = Extract<OperationResult, { kind: "status" }>;
type Row = Doc<"projectOperations">;
type Page = "home" | "commit" | "review" | "branches";

const WARN = "#d9730d";

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
  chevronDown: { ios: "chevron.down", android: "expand_more", web: "expand_more" },
  chevronRight: { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
  check: { ios: "checkmark", android: "check", web: "check" },
  close: { ios: "xmark", android: "close", web: "close" },
} as const;

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
  const theme = useTheme();
  const router = useRouter();
  const rows = useQuery(api.projectOperations.list, visible ? { projectId: project._id } : "skip");
  const enqueue = useMutation(api.projectOperations.enqueue);
  const [page, setPage] = useState<Page>("home");
  const [menu, setMenu] = useState(false);
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

  async function refresh() {
    try {
      await enqueue({ projectId: project._id, operation: { kind: "status" } });
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
      setMenu(false);
      return;
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15_000);
    return () => clearInterval(timer);
  }, [visible, project._id]);
  // Re-read the repository once an action finishes, so every page reflects it.
  useEffect(() => {
    if (last?.state === "done" || last?.state === "failed") void refresh();
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

  const banner = error ? (
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
  ) : null;

  const push = pushState(git, dirty);
  const pr = prState(git, dirty, isDefault);

  return (
    <Sheet
      title={title}
      visible={visible}
      onClose={onClose}
      scroll={false}
      header={
          <View style={[styles.header, { borderColor: theme.line }]}>
            <IconButton
              icon="back"
              accessibilityLabel={page === "home" ? "Close git controls" : "Back"}
              onPress={back}
              style={{ backgroundColor: "transparent" }}
            />
            <View style={styles.headerText}>
              <Text numberOfLines={1} style={[styles.title, { color: theme.text }]}>
                {title}
              </Text>
              {subtitle ? (
                <Text numberOfLines={1} style={[styles.subtitle, { color: theme.textSecondary }]}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {page === "home" ? (
              <IconButton
                icon="more"
                accessibilityLabel="More git actions"
                onPress={() => setMenu((open) => !open)}
                style={{ backgroundColor: menu ? theme.backgroundSelected : "transparent" }}
              />
            ) : null}
          </View>
      }>
      <View style={sheetFillLayout}>
          {banner}

          {page === "home" ? (
            <ScrollView style={sheetFillLayout} nestedScrollEnabled contentContainerStyle={styles.body}>
              <Card>
                <ActionRow
                  icon={ICONS.commit}
                  title="Commit"
                  subtitle={dirty ? `${plural(files.length, "file")} changed` : "No changes to commit"}
                  disabled={!dirty || busy}
                  onPress={() => setPage("commit")}
                />
                <ActionRow
                  icon={ICONS.push}
                  title={push.title}
                  subtitle={push.subtitle}
                  disabled={!push.enabled || busy}
                  onPress={() => void act({ kind: "push" })}
                />
                <ActionRow
                  icon={ICONS.pr}
                  title="Create PR"
                  subtitle={pr.subtitle}
                  disabled={!pr.enabled || busy}
                  onPress={() => void act({ kind: "createPr" })}
                />
                <ActionRow
                  icon={ICONS.review}
                  title="Review changes"
                  subtitle={dirty ? "See what changed in each file" : "No changes to review"}
                  disabled={!dirty}
                  onPress={() => setPage("review")}
                />
                <ActionRow
                  icon={ICONS.branches}
                  title="Branches & worktrees"
                  subtitle="Switch branch, create branch, or move to a worktree"
                  onPress={() => setPage("branches")}
                />
              </Card>
            </ScrollView>
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
            <ReviewPage
              projectId={project._id}
              files={files}
              excluded={excluded}
              rows={rows ?? []}
              onToggle={toggle}
            />
          ) : page === "branches" ? (
            <BranchesPage git={git} busy={busy} act={act} />
          ) : (
            <ActivityIndicator color={theme.textSecondary} style={{ margin: 32 }} />
          )}

          {menu && page === "home" ? (
            <View style={[styles.menu, { backgroundColor: theme.backgroundElement, borderColor: theme.line }]}>
              {[
                { label: "Refresh", onPress: () => void refresh() },
                { label: "Fetch", onPress: () => void act({ kind: "fetch" }), disabled: busy },
                {
                  label: git?.behind ? `Pull ${git.behind}` : "Pull",
                  onPress: () => void act({ kind: "pull" }),
                  disabled: busy || dirty,
                },
                {
                  label: "Open Git page",
                  onPress: () => {
                    onClose();
                    router.push("/git");
                  },
                },
              ].map((item) => (
                <Pressable
                  key={item.label}
                  accessibilityRole="menuitem"
                  disabled={item.disabled}
                  onPress={() => {
                    setMenu(false);
                    item.onPress();
                  }}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && { backgroundColor: theme.subtleHover },
                    item.disabled && { opacity: 0.4 },
                  ]}>
                  <Text style={{ color: theme.text, fontSize: 15 }}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
      </View>
    </Sheet>
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
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [branchMode, setBranchMode] = useState(false);
  const [branch, setBranch] = useState("");
  const preview = editing ? files : selected.slice(0, 3);
  const canCommit = selected.length > 0 && !busy && (!branchMode || !!branch.trim());
  return (
    <>
      <ScrollView style={sheetFillLayout} nestedScrollEnabled contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Card padded>
          <Text style={[styles.label, { color: theme.textSecondary }]}>Branch</Text>
          <Text style={[styles.value, { color: theme.text }]}>{branchMode && branch.trim() ? branch.trim() : git.branch}</Text>
          {isDefault && !branchMode ? (
            <Text style={[styles.warn, { color: WARN }]}>Warning: this is the default branch.</Text>
          ) : null}
          {branchMode ? (
            <TextInput
              accessibilityLabel="New branch name"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              placeholder="feature/my-change"
              placeholderTextColor={theme.textSecondary}
              value={branch}
              onChangeText={setBranch}
              style={[styles.input, { color: theme.text, borderColor: theme.line, marginTop: 10 }]}
            />
          ) : null}
        </Card>

        <Card padded>
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>Files</Text>
              <Text style={[styles.meta, { color: theme.textSecondary }]}>
                {selected.length} selected · +{totals.added} / −{totals.removed}
              </Text>
            </View>
            <Pressable accessibilityRole="button" hitSlop={10} onPress={() => setEditing((v) => !v)}>
              <Text style={[styles.link, { color: theme.accent }]}>{editing ? "Done" : "Edit"}</Text>
            </Pressable>
          </View>
          {preview.map((item) => (
            <Pressable
              key={item.path}
              accessibilityRole={editing ? "checkbox" : undefined}
              accessibilityState={editing ? { checked: !excluded.has(item.path) } : undefined}
              disabled={!editing}
              onPress={() => onToggle(item.path)}
              style={styles.fileLine}>
              {editing ? <Check on={!excluded.has(item.path)} /> : null}
              <Text numberOfLines={1} ellipsizeMode="head" style={[styles.path, { color: theme.text }]}>
                {item.path}
              </Text>
              <Counts file={item} />
            </Pressable>
          ))}
          {!editing && selected.length > 3 ? (
            <Text style={[styles.meta, { color: theme.textSecondary }]}>+{selected.length - 3} more files</Text>
          ) : null}
        </Card>

        <Card padded>
          <Text style={[styles.cardTitle, { color: theme.text }]}>Commit message</Text>
          <TextInput
            accessibilityLabel="Commit message"
            multiline
            placeholder="Leave empty to auto-generate"
            placeholderTextColor={theme.textSecondary}
            value={message}
            onChangeText={setMessage}
            style={[styles.input, styles.message, { color: theme.text, borderColor: theme.line }]}
          />
        </Card>
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setBranchMode((v) => !v);
            setBranch("");
          }}
          style={({ pressed }) => [
            styles.secondary,
            { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
          ]}>
          <Text style={[styles.secondaryLabel, { color: theme.text }]}>
            {branchMode ? "Commit on current branch" : "Commit on new branch"}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!canCommit}
          onPress={() => void onCommit(message.trim(), branchMode ? branch.trim() : undefined)}
          style={({ pressed }) => [
            styles.primary,
            { backgroundColor: theme.accent, opacity: !canCommit ? 0.45 : pressed ? 0.85 : 1 },
          ]}>
          <Text style={styles.primaryLabel}>{branchMode ? "Create branch & commit" : "Commit"}</Text>
        </Pressable>
      </View>
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
  const theme = useTheme();
  const enqueue = useMutation(api.projectOperations.enqueue);
  const [open, setOpen] = useState<Set<string>>(() => new Set(files[0] ? [files[0].path] : []));
  const loadDiff = (path: string) =>
    void enqueue({ projectId, operation: { kind: "diff", path } }).catch(() => {});
  useEffect(() => {
    if (files[0]) loadDiff(files[0].path);
  }, []);
  return (
    <ScrollView style={sheetFillLayout} nestedScrollEnabled contentContainerStyle={{ paddingBottom: 32 }}>
      {files.map((item) => {
        const expanded = open.has(item.path);
        const status = formatFileStatus(item.status);
        const tone = status.tone === "danger" ? theme.danger : status.tone === "success" ? theme.success : theme.text;
        const diff = rows.find((row) => row.operation.kind === "diff" && row.operation.path === item.path);
        return (
          <View key={item.path} style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderColor: theme.line }}>
            <View style={[styles.reviewRow, { backgroundColor: theme.backgroundElement }]}>
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
                style={styles.reviewToggle}>
                <SymbolView
                  name={expanded ? ICONS.chevronDown : ICONS.chevronRight}
                  size={14}
                  tintColor={theme.textSecondary}
                />
                <View accessibilityLabel={status.label} style={[styles.statusRing, { borderColor: tone }]}>
                  <View style={[styles.statusDot, { backgroundColor: tone }]} />
                </View>
                <Text numberOfLines={1} ellipsizeMode="head" style={[styles.reviewPath, { color: theme.text }]}>
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
    </ScrollView>
  );
}

function DiffBlock({ diff }: { diff?: Row }) {
  const theme = useTheme();
  const parsed = useMemo(
    () => (diff?.result?.kind === "text" ? parseDiff(diff.result.text) : undefined),
    [diff?.result],
  );
  const numbers = useMemo(() => (parsed ? numberDiffLines(parsed.lines) : []), [parsed]);
  if (!parsed) {
    return diff?.state === "failed" ? (
      <Text style={[styles.meta, { color: theme.danger, padding: 16 }]}>{diff.error}</Text>
    ) : (
      <ActivityIndicator color={theme.textSecondary} style={{ margin: 16 }} />
    );
  }
  if (!parsed.lines.some((line) => line.kind !== "ctx" || line.text)) {
    return <Text style={[styles.meta, { color: theme.textSecondary, padding: 16 }]}>No text changes to show.</Text>;
  }
  return (
    <ScrollView horizontal>
      <View style={{ minWidth: "100%" }}>
        {parsed.lines.map((line, i) => (
          <View
            key={i}
            style={[
              styles.diffLine,
              line.kind === "add"
                ? { backgroundColor: "rgba(63, 185, 80, 0.12)" }
                : line.kind === "del"
                  ? { backgroundColor: "rgba(248, 81, 73, 0.12)" }
                  : line.kind === "hunk"
                    ? { backgroundColor: theme.subtleHover }
                    : null,
            ]}>
            <View
              style={[
                styles.gutter,
                line.kind === "add" && { borderLeftColor: theme.success },
                line.kind === "del" && { borderLeftColor: theme.danger },
              ]}>
              <Text style={[styles.lineNo, { color: theme.textSecondary }]}>{numbers[i] ?? ""}</Text>
            </View>
            <Text
              selectable
              style={[
                styles.code,
                {
                  color:
                    line.kind === "add"
                      ? theme.success
                      : line.kind === "del"
                        ? theme.danger
                        : line.kind === "hunk"
                          ? theme.textSecondary
                          : theme.text,
                },
              ]}>
              {line.kind === "hunk" ? line.text : line.text.slice(1) || " "}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
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
  const theme = useTheme();
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
    <ScrollView style={sheetFillLayout} nestedScrollEnabled contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Card padded>
        <Text style={[styles.cardTitle, { color: theme.text }]}>New branch</Text>
        <TextInput
          accessibilityLabel="New branch name"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="feature/my-change"
          placeholderTextColor={theme.textSecondary}
          value={name}
          onChangeText={setName}
          style={[styles.input, { color: theme.text, borderColor: theme.line }]}
        />
        <SecondaryButton
          label="Create & checkout"
          disabled={busy || !name.trim()}
          onPress={() =>
            void act({ kind: "createBranch", name: name.trim(), checkout: true }).then((ok) => ok && setName(""))
          }
        />
      </Card>

      <Card padded>
        <Text style={[styles.cardTitle, { color: theme.text }]}>New worktree</Text>
        <Text style={[styles.label, { color: theme.textSecondary }]}>Base branch</Text>
        <TextInput
          accessibilityLabel="Base branch"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={baseBranch || "main"}
          placeholderTextColor={theme.textSecondary}
          value={base}
          onChangeText={setBase}
          style={[styles.input, { color: theme.text, borderColor: theme.line }]}
        />
        <Text style={[styles.label, { color: theme.textSecondary }]}>New branch</Text>
        <TextInput
          accessibilityLabel="Worktree branch name"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="feature/parallel-work"
          placeholderTextColor={theme.textSecondary}
          value={worktreeBranch}
          onChangeText={setWorktreeBranch}
          style={[styles.input, { color: theme.text, borderColor: theme.line }]}
        />
        <SecondaryButton
          label="Create worktree"
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
          }
        />
      </Card>

      <Text style={[styles.section, { color: theme.textSecondary }]}>Existing branches</Text>
      {all.length > 8 ? (
        <TextInput
          accessibilityLabel="Filter branches"
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Filter branches"
          placeholderTextColor={theme.textSecondary}
          value={query}
          onChangeText={setQuery}
          style={[styles.input, { color: theme.text, borderColor: theme.line, backgroundColor: theme.backgroundElement }]}
        />
      ) : null}
      {!git ? <Text style={[styles.meta, { color: theme.textSecondary }]}>Loading branches…</Text> : null}
      {locals.map((item) => {
        const elsewhere = !item.current && !!item.worktreePath;
        return (
          <BranchRow
            key={item.name}
            name={item.name}
            detail={item.current ? "Current branch" : elsewhere ? "Checked out in another worktree" : "Local branch"}
            current={item.current}
            disabled={busy || item.current || elsewhere}
            onPress={() => void act({ kind: "checkout", branch: item.name })}
          />
        );
      })}
      {remotes.map((item) => (
        <BranchRow
          key={item.name}
          name={item.name}
          detail="Remote branch · checking out makes a local copy"
          disabled={busy}
          onPress={() => void act({ kind: "checkout", branch: item.name })}
        />
      ))}
    </ScrollView>
  );
}

function BranchRow({
  name,
  detail,
  current,
  disabled,
  onPress,
}: {
  name: string;
  detail: string;
  current?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${detail}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.branchRow,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
        disabled && !current && { opacity: 0.5 },
      ]}>
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text numberOfLines={1} style={[styles.branchName, { color: theme.text }]}>
          {name}
        </Text>
        <Text numberOfLines={1} style={[styles.meta, { color: theme.textSecondary }]}>
          {detail}
        </Text>
      </View>
      {current ? <SymbolView name={ICONS.check} size={16} tintColor={theme.accent} /> : null}
    </Pressable>
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
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && { backgroundColor: theme.subtleHover },
        disabled && { opacity: 0.45 },
      ]}>
      <SymbolView name={icon} size={24} tintColor={theme.text} />
      <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
        <Text style={[styles.actionTitle, { color: theme.text }]}>{title}</Text>
        <Text style={[styles.actionSubtitle, { color: theme.textSecondary }]}>{subtitle}</Text>
      </View>
    </Pressable>
  );
}

function Counts({ file, reverse }: { file: GitFile; reverse?: boolean }) {
  const theme = useTheme();
  if (file.added === undefined || file.removed === undefined) {
    const status = formatFileStatus(file.status);
    return <Text style={[styles.counts, { color: theme.textSecondary }]}>{status.label}</Text>;
  }
  const add = <Text style={{ color: theme.success }}>+{file.added}</Text>;
  const del = <Text style={{ color: theme.danger }}>−{file.removed}</Text>;
  return (
    <Text style={styles.counts}>
      {reverse ? del : add}
      {"  "}
      {reverse ? add : del}
    </Text>
  );
}

function Check({ on }: { on: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.check,
        { borderColor: on ? theme.accent : theme.lineStrong, backgroundColor: on ? theme.accent : "transparent" },
      ]}>
      {on ? <SymbolView name={ICONS.check} size={13} tintColor="#ffffff" /> : null}
    </View>
  );
}

function SecondaryButton({ label, disabled, onPress }: { label: string; disabled?: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondary,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.sidebar, opacity: disabled ? 0.5 : 1 },
      ]}>
      <Text style={[styles.secondaryLabel, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

function Card({ children, padded }: { children: ReactNode; padded?: boolean }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, padded && styles.cardPadded, { backgroundColor: theme.backgroundElement }]}>
      {children}
    </View>
  );
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
  const theme = useTheme();
  const color = tone === "danger" ? theme.danger : tone === "success" ? theme.success : theme.textSecondary;
  return (
    <View style={[styles.banner, { backgroundColor: theme.backgroundElement }]}>
      {tone === "busy" ? <ActivityIndicator size="small" color={color} /> : null}
      <Text style={[styles.bannerText, { color }]} numberOfLines={4}>
        {text}
      </Text>
      {link ? (
        <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(link)}>
          <Text style={[styles.link, { color: theme.accent }]}>Open</Text>
        </Pressable>
      ) : null}
      {onClose ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={10} onPress={onClose}>
          <SymbolView name={ICONS.close} size={14} tintColor={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "500" },
  subtitle: { fontSize: 14, lineHeight: 19 },
  body: { padding: 10, paddingBottom: 24, gap: 10 },
  card: { borderRadius: 20, borderCurve: "continuous", overflow: "hidden" },
  cardPadded: { padding: 18, gap: 8 },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: "500" },
  label: { fontSize: 13, lineHeight: 18 },
  value: { fontSize: 17, lineHeight: 22 },
  warn: { fontSize: 14, lineHeight: 19, marginTop: 6 },
  meta: { fontSize: 13, lineHeight: 18 },
  link: { fontSize: 15, fontWeight: "600" },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: 12 },
  fileLine: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 32 },
  path: { flex: 1, fontSize: 14 },
  counts: { fontSize: 13, fontFamily: Fonts?.mono, fontVariant: ["tabular-nums"] },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 16,
  },
  message: { minHeight: 110, textAlignVertical: "top" },
  footer: { paddingHorizontal: 10, paddingTop: 4, paddingBottom: 10, gap: 8 },
  primary: { minHeight: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  primaryLabel: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  secondary: { minHeight: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  secondaryLabel: { fontSize: 15, fontWeight: "600" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 18, paddingHorizontal: 20, paddingVertical: 14, minHeight: 72 },
  actionTitle: { fontSize: 17, lineHeight: 22 },
  actionSubtitle: { fontSize: 14, lineHeight: 19 },
  menu: {
    position: "absolute",
    top: 4,
    right: 14,
    minWidth: 200,
    paddingVertical: 6,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    boxShadow: "0 12px 32px rgba(0,0,0,0.18)",
  },
  menuItem: { minHeight: 44, justifyContent: "center", paddingHorizontal: 16 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 10,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  bannerText: { flex: 1, fontSize: 14, lineHeight: 19 },
  section: { fontSize: 14, marginTop: 8, paddingHorizontal: 8 },
  branchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 18,
    borderCurve: "continuous",
  },
  branchName: { fontSize: 17, lineHeight: 22 },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingRight: 14, minHeight: 56 },
  reviewToggle: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 14, paddingVertical: 12 },
  reviewPath: { flex: 1, fontSize: 14, fontWeight: "600" },
  statusRing: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  check: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  diffLine: { flexDirection: "row", minHeight: 22 },
  gutter: { width: 52, paddingRight: 10, borderLeftWidth: 3, borderLeftColor: "transparent", alignItems: "flex-end", justifyContent: "center" },
  lineNo: { fontSize: 12, fontFamily: Fonts?.mono, fontVariant: ["tabular-nums"] },
  code: { fontFamily: Fonts?.mono, fontSize: 13, lineHeight: 22, paddingRight: 16 },
});
