import { expect, test } from "bun:test";
import {
  formatAheadBehind,
  formatCommitAge,
  formatFileStatus,
  localBranchName,
  localBranches,
  remoteOnlyBranches,
  shortSha,
} from "./format";

test("formatCommitAge stays relative then falls back to a date", () => {
  expect(formatCommitAge(1_000, 1_000 * 1000)).toBe("just now");
  expect(formatCommitAge(1_000, (1_000 + 5 * 60) * 1000)).toBe("5m ago");
  expect(formatCommitAge(1_000, (1_000 + 3 * 3600) * 1000)).toBe("3h ago");
  expect(formatCommitAge(1_000, (1_000 + 2 * 86400) * 1000)).toBe("2d ago");
});

test("formatAheadBehind names divergence against upstream", () => {
  expect(formatAheadBehind({ ahead: 2, behind: 1, upstream: "origin/main" })).toBe(
    "2 ahead · 1 behind",
  );
  expect(formatAheadBehind({ ahead: 3, behind: 0, upstream: "origin/main" })).toBe(
    "3 ahead",
  );
  expect(formatAheadBehind({ gone: true, upstream: "origin/main" })).toBe(
    "upstream gone",
  );
  expect(formatAheadBehind({ ahead: 0, behind: 0, upstream: "origin/main" })).toBe(
    "up to date",
  );
  expect(formatAheadBehind({})).toBe("no upstream");
});

test("formatFileStatus colors deletes, untracked, and edits", () => {
  expect(formatFileStatus(" D")).toEqual({ label: "D", tone: "danger" });
  expect(formatFileStatus("??")).toEqual({ label: "??", tone: "muted" });
  expect(formatFileStatus("M ")).toEqual({ label: "M", tone: "success" });
});

test("remote-only branches drop remotes that already have a local counterpart", () => {
  expect(shortSha("abcdefghij")).toBe("abcdefg");
  expect(localBranchName("origin/fix-auth")).toBe("fix-auth");
  const branches = [
    { name: "main", remote: false, upstream: "origin/main" },
    { name: "origin/main", remote: true },
    { name: "origin/feat", remote: true },
  ];
  expect(localBranches(branches).map((item) => item.name)).toEqual(["main"]);
  expect(remoteOnlyBranches(branches).map((item) => item.name)).toEqual([
    "origin/feat",
  ]);
});
