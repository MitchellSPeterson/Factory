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

export function formatFileStatus(status: string) {
  const label = status.trim() || status;
  if (status.includes("D")) return { label, tone: "danger" as const };
  if (status.includes("?")) return { label, tone: "muted" as const };
  return { label, tone: "success" as const };
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
