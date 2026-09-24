export type GitTab = "changes" | "branches" | "worktrees" | "history";

export const GIT_TABS: { id: GitTab; label: string }[] = [
  { id: "changes", label: "Changes" },
  { id: "branches", label: "Branches" },
  { id: "worktrees", label: "Worktrees" },
  { id: "history", label: "History" },
];

export function formatCommitAge(epochSeconds: number, nowMs: number) {
  const delta = Math.max(0, nowMs / 1000 - epochSeconds);
  if (delta < 45) return "just now";
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  if (delta < 86400 * 30) return `${Math.floor(delta / 86400)}d ago`;
  return new Date(epochSeconds * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatAheadBehind(input: {
  ahead?: number;
  behind?: number;
  gone?: boolean;
  upstream?: string;
}) {
  if (input.gone) return "upstream gone";
  const ahead = input.ahead ?? 0;
  const behind = input.behind ?? 0;
  if (ahead && behind) return `${ahead} ahead · ${behind} behind`;
  if (ahead) return `${ahead} ahead`;
  if (behind) return `${behind} behind`;
  if (input.upstream) return "up to date";
  return "no upstream";
}

export type FileTone = "success" | "danger" | "accent" | "muted";

/** Porcelain v1 XY code → a word a person understands. */
export function formatFileStatus(status: string): {
  letter: string;
  label: string;
  tone: FileTone;
} {
  if (status.includes("U") || status === "AA" || status === "DD")
    return { letter: "!", label: "Conflict", tone: "danger" };
  if (status === "??") return { letter: "N", label: "New file", tone: "success" };
  if (status.includes("D")) return { letter: "D", label: "Deleted", tone: "danger" };
  if (status.includes("R")) return { letter: "R", label: "Renamed", tone: "accent" };
  if (status.includes("A")) return { letter: "A", label: "Added", tone: "success" };
  return { letter: "M", label: "Modified", tone: "accent" };
}

export function splitPath(path: string) {
  const slash = path.lastIndexOf("/");
  return slash === -1
    ? { name: path, dir: "" }
    : { name: path.slice(slash + 1), dir: path.slice(0, slash) };
}

export function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export type SyncOp = "push" | "pull" | "fetch";

/** One plain-language line about the remote, plus the one action that moves it forward. */
export function describeSync(
  git: {
    upstream?: string;
    ahead?: number;
    behind?: number;
    gone?: boolean;
    remotes?: string[];
    detached?: boolean;
  },
  dirty: boolean,
): { summary: string; action?: { op: SyncOp; label: string; blocked?: string } } {
  if (!git.remotes?.length) return { summary: "Local only. No remote is set up." };
  if (git.detached)
    return {
      summary: "Detached HEAD. Switch to a branch to sync.",
      action: { op: "fetch", label: "Fetch" },
    };
  if (git.gone || !git.upstream)
    return {
      summary: git.gone
        ? "The remote branch was deleted."
        : "This branch isn't on the remote yet.",
      action: { op: "push", label: "Publish branch" },
    };
  const ahead = git.ahead ?? 0;
  const behind = git.behind ?? 0;
  if (ahead && behind)
    return {
      summary: `Diverged from ${git.upstream}: ${ahead} to push, ${behind} to pull. Merge or rebase in a terminal.`,
      action: { op: "fetch", label: "Fetch" },
    };
  if (behind)
    return {
      summary: `${plural(behind, "commit")} to pull from ${git.upstream}.`,
      action: {
        op: "pull",
        label: `Pull ${behind}`,
        blocked: dirty ? "Commit your changes before pulling." : undefined,
      },
    };
  if (ahead)
    return {
      summary: `${plural(ahead, "commit")} to push to ${git.upstream}.`,
      action: { op: "push", label: `Push ${ahead}` },
    };
  return {
    summary: `Up to date with ${git.upstream}.`,
    action: { op: "fetch", label: "Fetch" },
  };
}

export type DiffLine = { text: string; kind: "add" | "del" | "hunk" | "ctx" };

/** Drops the git header noise before the first hunk; the file name is already on screen. */
export function parseDiff(text: string) {
  let raw = text.replace(/\n$/, "").split("\n");
  const first = raw.findIndex((line) => line.startsWith("@@"));
  if (first > 0) raw = raw.slice(first);
  let added = 0;
  let removed = 0;
  const lines: DiffLine[] = raw.map((line) => {
    if (line.startsWith("@@")) return { text: line, kind: "hunk" };
    if (line.startsWith("+")) {
      added++;
      return { text: line, kind: "add" };
    }
    if (line.startsWith("-")) {
      removed++;
      return { text: line, kind: "del" };
    }
    return { text: line, kind: "ctx" };
  });
  return { lines, added, removed };
}

export function shortSha(sha: string) {
  return sha.slice(0, 7);
}

export function localBranchName(remoteName: string) {
  const slash = remoteName.indexOf("/");
  return slash === -1 ? remoteName : remoteName.slice(slash + 1);
}

export function localBranches<T extends { remote: boolean }>(branches: T[]) {
  return branches.filter((item) => !item.remote);
}

export function remoteOnlyBranches<
  T extends { name: string; remote: boolean; upstream?: string },
>(branches: T[]) {
  const local = localBranches(branches);
  return branches.filter((item) => {
    if (!item.remote) return false;
    const tracked = localBranchName(item.name);
    return !local.some(
      (branch) => branch.name === tracked || branch.upstream === item.name,
    );
  });
}

/** Message used when the commit box is left empty: names the file, or the folder the files share. */
export function autoCommitMessage(paths: string[]) {
  if (paths.length === 1) return `Update ${splitPath(paths[0]!).name}`;
  const parts = paths.map((item) => item.split("/").slice(0, -1));
  const shared: string[] = [];
  for (let i = 0; parts.every((p) => p[i] !== undefined && p[i] === parts[0]![i]); i++) shared.push(parts[0]![i]!);
  return shared.length ? `Update ${paths.length} files in ${shared.join("/")}` : `Update ${paths.length} files`;
}

/** Old/new line numbers for each parsed diff line, read from the hunk headers. */
export function numberDiffLines(lines: DiffLine[]) {
  let oldNo = 0;
  let newNo = 0;
  return lines.map((line) => {
    if (line.kind === "hunk") {
      const match = line.text.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)/);
      oldNo = Number(match?.[1] ?? 0);
      newNo = Number(match?.[2] ?? 0);
      return undefined;
    }
    if (line.kind === "add") return newNo++;
    if (line.kind === "del") return oldNo++;
    oldNo++;
    return newNo++;
  });
}
