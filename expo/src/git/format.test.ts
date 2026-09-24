import { expect, test } from "bun:test";
import {
  autoCommitMessage,
  numberDiffLines,
  formatAheadBehind,
  formatCommitAge,
  describeSync,
  formatFileStatus,
  parseDiff,
  localBranchName,
  localBranches,
  remoteOnlyBranches,
  shortSha,
  splitPath,
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

test("formatFileStatus turns porcelain codes into words", () => {
  expect(formatFileStatus(" D").label).toBe("Deleted");
  expect(formatFileStatus("??").label).toBe("New file");
  expect(formatFileStatus("M ").label).toBe("Modified");
  expect(formatFileStatus("R ").label).toBe("Renamed");
  expect(formatFileStatus("UU").label).toBe("Conflict");
  expect(formatFileStatus("AA").label).toBe("Conflict");
  expect(splitPath("src/git/format.ts")).toEqual({ name: "format.ts", dir: "src/git" });
  expect(splitPath("README.md")).toEqual({ name: "README.md", dir: "" });
});

test("describeSync offers the one action that moves the branch forward", () => {
  const base = { remotes: ["origin"], upstream: "origin/main" };
  expect(describeSync({}, false).action).toBeUndefined();
  expect(describeSync({ remotes: ["origin"] }, false).action?.label).toBe("Publish branch");
  expect(describeSync({ ...base, gone: true }, false).action?.op).toBe("push");
  expect(describeSync({ ...base, ahead: 2 }, false).action?.label).toBe("Push 2");
  expect(describeSync({ ...base, behind: 1 }, false).action?.blocked).toBeUndefined();
  expect(describeSync({ ...base, behind: 1 }, true).action?.blocked).toBeTruthy();
  expect(describeSync({ ...base, ahead: 1, behind: 1 }, false).action?.op).toBe("fetch");
  expect(describeSync(base, false).summary).toBe("Up to date with origin/main.");
});

test("parseDiff drops headers before the first hunk and counts lines", () => {
  const diff = parseDiff(
    "diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n ctx\n",
  );
  expect(diff.lines.map((line) => line.kind)).toEqual(["hunk", "del", "add", "ctx"]);
  expect([diff.added, diff.removed]).toEqual([1, 1]);
  expect(parseDiff("Binary files differ").lines).toEqual([
    { text: "Binary files differ", kind: "ctx" },
  ]);
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

test("autoCommitMessage names the file or shared folder", () => {
  expect(autoCommitMessage(["expo/src/app/index.tsx"])).toBe("Update index.tsx");
  expect(autoCommitMessage(["worker/a.ts", "worker/b.ts"])).toBe("Update 2 files in worker");
  expect(autoCommitMessage(["a.ts", "worker/b.ts"])).toBe("Update 2 files");
});

test("numberDiffLines follows hunk headers", () => {
  const { lines } = parseDiff("@@ -10,3 +10,3 @@\n ctx\n-old\n+new\n ctx2");
  expect(numberDiffLines(lines)).toEqual([undefined, 10, 11, 11, 12]);
});
