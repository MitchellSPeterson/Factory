export type ProjectOperation =
  | { kind: "status" }
  | { kind: "diff"; path: string }
  | {
      kind: "commit";
      message: string;
      expectedBranch?: string;
      paths: string[];
    }
  | { kind: "checkout"; branch: string }
  | { kind: "createBranch"; name: string; checkout: boolean }
  | { kind: "createWorktree"; name: string; branch: string; createBranch: boolean }
  | { kind: "removeWorktree"; path: string }
  | { kind: "fetch" }
  | { kind: "pull" }
  | { kind: "push" }
  | { kind: "terminal"; command: string };

export type GitFile = {
  path: string;
  status: string;
  originalPath?: string;
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
  | { kind: "text"; text: string; exitCode: number };

export type OperationState = "queued" | "running" | "done" | "failed" | "cancelled";
