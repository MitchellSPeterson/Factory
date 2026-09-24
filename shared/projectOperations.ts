export type ProjectOperation =
  | { kind: "status" }
  | { kind: "diff"; path: string }
  | {
      kind: "commit";
      message: string;
      expectedBranch?: string;
      /** Create and switch to this branch first, so the commit lands on it. */
      newBranch?: string;
      paths: string[];
    }
  | { kind: "checkout"; branch: string }
  | { kind: "createBranch"; name: string; checkout: boolean }
  | { kind: "createWorktree"; name: string; branch: string; createBranch: boolean; base?: string }
  | { kind: "removeWorktree"; path: string }
  | { kind: "fetch" }
  | { kind: "pull" }
  | { kind: "push" }
  | { kind: "createPr" }
  | { kind: "terminal"; command: string }
  | { kind: "listFiles"; path: string }
  | { kind: "readFile"; path: string };

export type FileEntry = { name: string; dir: boolean; size?: number };

export type GitFile = {
  path: string;
  status: string;
  originalPath?: string;
  /** Lines added/removed against HEAD; absent for untracked or binary files. */
  added?: number;
  removed?: number;
};

export type GitBranch = {
  name: string;
  current: boolean;
  remote: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  gone: boolean;
  worktreePath?: string;
};

export type GitWorktree = {
  path: string;
  head: string;
  branch?: string;
  bare: boolean;
  locked: boolean;
  prunable: boolean;
  current: boolean;
};

export type GitCommit = {
  sha: string;
  subject: string;
  author: string;
  committedAt: number;
};

export type OperationResult =
  | {
      kind: "status";
      branch: string;
      defaultBranch?: string;
      files: GitFile[];
      head?: string;
      detached?: boolean;
      upstream?: string;
      ahead?: number;
      behind?: number;
      gone?: boolean;
      remotes?: string[];
      branches?: GitBranch[];
      worktrees?: GitWorktree[];
      commits?: GitCommit[];
    }
  | { kind: "text"; text: string; exitCode: number }
  | { kind: "files"; path: string; entries: FileEntry[]; truncated?: boolean }
  | { kind: "file"; path: string; size: number; text?: string; binary?: boolean; truncated?: boolean };

export type OperationState = "queued" | "running" | "done" | "failed" | "cancelled";
