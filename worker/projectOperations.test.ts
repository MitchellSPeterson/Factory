import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  parseNumstat,
  executeProjectOperation,
  parseForEachRef,
  parseGitStatus,
  parseLog,
  parseTrack,
  parseWorktrees,
  validateBranchName,
  validateGitPath,
  validateWorktreeName,
} from "./projectOperations";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function repo() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "factory-git-test-"));
  directories.push(directory);
  await git(directory, ["init", "-b", "main"]);
  await git(directory, ["config", "user.email", "test@example.test"]);
  await git(directory, ["config", "user.name", "Factory test"]);
  await writeFile(path.join(directory, "one.txt"), "one\n");
  await writeFile(path.join(directory, "two.txt"), "two\n");
  await git(directory, ["add", "."]);
  await git(directory, ["commit", "-m", "initial"]);
  return directory;
}
async function git(cwd: string, args: string[]) {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const text = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0)
    throw new Error(await new Response(proc.stderr).text());
  return text;
}
test("NUL status preserves spaces, newlines, and rename records", () => {
  expect(parseGitStatus(" M file name\0R  new\0old\0?? line\nname\0")).toEqual([
    { status: " M", path: "file name" },
    { status: "R ", path: "new", originalPath: "old" },
    { status: "??", path: "line\nname" },
  ]);
});
test("rejects paths outside the repository and git internals", () => {
  for (const value of [
    "../secret",
    "/tmp/file",
    ".git/config",
    "folder/../../x",
  ])
    expect(() => validateGitPath(value)).toThrow();
  expect(validateGitPath("file with spaces.txt")).toBe("file with spaces.txt");
});
test("status and diffs include unstaged, staged, and untracked text", async () => {
  const directory = await repo();
  await writeFile(path.join(directory, "one.txt"), "updated\n");
  await writeFile(path.join(directory, "new file.txt"), "hello\n");
  const status = await executeProjectOperation(directory, { kind: "status" });
  expect(status.kind).toBe("status");
  if (status.kind === "status")
    expect(status.files.map((file) => file.path)).toEqual([
      "one.txt",
      "new file.txt",
    ]);
  const diff = await executeProjectOperation(directory, {
    kind: "diff",
    path: "new file.txt",
  });
  expect(diff.kind === "text" && diff.text).toContain("+hello");
});
test("commit only selected files and preserve unrelated staged changes", async () => {
  const directory = await repo();
  await writeFile(path.join(directory, "one.txt"), "selected\n");
  await writeFile(path.join(directory, "two.txt"), "unrelated\n");
  await git(directory, ["add", "two.txt"]);
  await executeProjectOperation(directory, {
    kind: "commit",
    paths: ["one.txt"],
    message: "selected change",
  });
  expect(await git(directory, ["show", "HEAD:one.txt"])).toBe("selected\n");
  expect(await git(directory, ["show", "HEAD:two.txt"])).toBe("two\n");
  expect(await git(directory, ["diff", "--cached", "--name-only"])).toBe(
    "two.txt\n",
  );
  expect(await readFile(path.join(directory, "two.txt"), "utf8")).toBe(
    "unrelated\n",
  );
});
test("terminal runs in project directory and returns exit code", async () => {
  const directory = await repo();
  let output = "";
  const result = await executeProjectOperation(
    directory,
    { kind: "terminal", command: "cat one.txt; exit 7" },
    (text) => {
      output = text;
    },
  );
  expect(result).toEqual({ kind: "text", text: "one\n", exitCode: 7 });
  expect(output).toBe("one\n");
});
test("terminal can be cancelled including its process group", async () => {
  const directory = await repo();
  const controller = new AbortController();
  const running = executeProjectOperation(
    directory,
    { kind: "terminal", command: "sleep 30" },
    undefined,
    controller.signal,
  );
  setTimeout(() => controller.abort(), 100);
  await expect(running).rejects.toThrow("cancelled");
});
test("selected staged rename commits both ends of the rename", async () => {
  const directory = await repo();
  await git(directory, ["mv", "one.txt", "renamed.txt"]);
  await executeProjectOperation(directory, {
    kind: "commit",
    paths: ["renamed.txt"],
    message: "rename",
  });
  expect(await git(directory, ["status", "--porcelain"])).toBe("");
  expect(await git(directory, ["ls-tree", "--name-only", "HEAD"])).toBe(
    "renamed.txt\ntwo.txt\n",
  );
});

test("parses branch track, for-each-ref, worktrees, and log records", () => {
  expect(parseTrack("ahead 2, behind 1")).toEqual({
    ahead: 2,
    behind: 1,
    gone: false,
  });
  expect(parseTrack("gone")).toEqual({ ahead: 0, behind: 0, gone: true });
  expect(
    parseForEachRef(
      "refs/heads/main\0main\0*\0abc\0origin/main\0ahead 1\0/repo\nrefs/remotes/origin/HEAD\0origin/HEAD\0\0abc\0\0\0\nrefs/remotes/origin/main\0origin/main\0\0abc\0\0\0\n",
    ),
  ).toEqual([
    {
      name: "main",
      current: true,
      remote: false,
      upstream: "origin/main",
      ahead: 1,
      behind: 0,
      gone: false,
      worktreePath: "/repo",
    },
    {
      name: "origin/main",
      current: false,
      remote: true,
      ahead: 0,
      behind: 0,
      gone: false,
    },
  ]);
  expect(
    parseWorktrees(
      "worktree /repo\nHEAD abc\nbranch refs/heads/main\n\nworktree /repo-feat\nHEAD def\nbranch refs/heads/feat\nlocked\n",
      "/repo",
    ),
  ).toEqual([
    {
      path: "/repo",
      head: "abc",
      branch: "main",
      bare: false,
      locked: false,
      prunable: false,
      current: true,
    },
    {
      path: "/repo-feat",
      head: "def",
      branch: "feat",
      bare: false,
      locked: true,
      prunable: false,
      current: false,
    },
  ]);
  expect(
    parseLog(
      ["abc", "subject", "Ada", "1720000000"].join("\0") +
        "\x1e" +
        ["def", "next", "Bob", "1720000001"].join("\0") +
        "\x1e",
    ),
  ).toEqual([
    { sha: "abc", subject: "subject", author: "Ada", committedAt: 1720000000 },
    { sha: "def", subject: "next", author: "Bob", committedAt: 1720000001 },
  ]);
  expect(() => validateBranchName("..oops")).toThrow();
  expect(validateWorktreeName("review-12")).toBe("review-12");
  expect(() => validateWorktreeName("a/b")).toThrow();
});

test("status snapshot includes this checkout, branches, and recent commits", async () => {
  const directory = await repo();
  const status = await executeProjectOperation(directory, { kind: "status" });
  expect(status.kind).toBe("status");
  if (status.kind !== "status") return;
  expect(status.commits?.some((item) => item.subject === "initial")).toBe(true);
  expect(status.worktrees?.some((item) => item.current)).toBe(true);
  expect(status.branches?.some((item) => item.current && !item.remote)).toBe(true);
});

test("checkout refuses a dirty tree and switch works after creating a branch", async () => {
  const directory = await repo();
  await writeFile(path.join(directory, "one.txt"), "dirty\n");
  await expect(
    executeProjectOperation(directory, {
      kind: "checkout",
      branch: "missing",
    }),
  ).rejects.toThrow("Commit or stash");
  await git(directory, ["checkout", "--", "one.txt"]);
  await executeProjectOperation(directory, {
    kind: "createBranch",
    name: "feature",
    checkout: true,
  });
  const onFeature = await executeProjectOperation(directory, { kind: "status" });
  expect(onFeature.kind === "status" && onFeature.branch).toBe("feature");
  await executeProjectOperation(directory, {
    kind: "checkout",
    branch: "main",
  });
  const onMain = await executeProjectOperation(directory, { kind: "status" });
  expect(onMain.kind === "status" && onMain.branch).toBe("main");
});

test("checking out a remote-only branch creates a local tracking branch", async () => {
  const directory = await repo();
  await git(directory, ["update-ref", "refs/remotes/origin/from-remote", "HEAD"]);
  await executeProjectOperation(directory, {
    kind: "checkout",
    branch: "origin/from-remote",
  });
  const status = await executeProjectOperation(directory, { kind: "status" });
  expect(status.kind === "status" && status.branch).toBe("from-remote");
});

test("worktrees are created as siblings and cannot remove the current checkout", async () => {
  const directory = await repo();
  await executeProjectOperation(directory, {
    kind: "createWorktree",
    name: "review",
    branch: "review",
    createBranch: true,
  });
  const status = await executeProjectOperation(directory, { kind: "status" });
  expect(status.kind).toBe("status");
  if (status.kind !== "status") return;
  const extra = status.worktrees?.find((item) => !item.current);
  expect(extra?.branch).toBe("review");
  expect(extra?.path.endsWith("-review")).toBe(true);
  await expect(
    executeProjectOperation(directory, {
      kind: "removeWorktree",
      path: directory,
    }),
  ).rejects.toThrow("this Project is using");
  if (!extra) throw new Error("expected extra worktree");
  await executeProjectOperation(directory, {
    kind: "removeWorktree",
    path: extra.path,
  });
  const after = await executeProjectOperation(directory, { kind: "status" });
  expect(
    after.kind === "status" && after.worktrees?.every((item) => item.current),
  ).toBe(true);
});

test("commit refuses a branch changed since review", async () => {
  const directory = await repo();
  await writeFile(path.join(directory, "one.txt"), "changed\n");
  await expect(
    executeProjectOperation(directory, {
      kind: "commit",
      paths: ["one.txt"],
      message: "test",
      expectedBranch: "some-other-branch",
    }),
  ).rejects.toThrow("branch changed");
  expect(await git(directory, ["diff", "--cached", "--name-only"])).toBe("");
});

test("file explorer lists, reads, and stays inside the Project", async () => {
  const { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } = await import("node:fs");
  const root = realpathSync(mkdtempSync(path.join(os.tmpdir(), "factory-files-")));
  mkdirSync(path.join(root, "src"));
  mkdirSync(path.join(root, ".git"));
  writeFileSync(path.join(root, "src", "a.ts"), "export const a = 1;\n");
  writeFileSync(path.join(root, "README.md"), "hi");
  writeFileSync(path.join(root, "blob.bin"), Buffer.from([1, 0, 2]));
  symlinkSync(os.tmpdir(), path.join(root, "escape"));

  const listed = await executeProjectOperation(root, { kind: "listFiles", path: "" });
  // Folders first, then files; .git hidden.
  expect(listed.kind === "files" ? listed.entries.map((e) => e.name) : []).toEqual(["escape", "src", "blob.bin", "README.md"]);

  expect(await executeProjectOperation(root, { kind: "readFile", path: "src/a.ts" }))
    .toMatchObject({ kind: "file", text: "export const a = 1;\n", size: 20 });
  expect(await executeProjectOperation(root, { kind: "readFile", path: "blob.bin" }))
    .toMatchObject({ kind: "file", binary: true });
  await expect(executeProjectOperation(root, { kind: "readFile", path: "../../etc/passwd" })).rejects.toThrow();
  await expect(executeProjectOperation(root, { kind: "listFiles", path: "escape" })).rejects.toThrow("Invalid file path.");
  await rm(root, { recursive: true, force: true });
});

test("parseNumstat reads counts, renames, and skips binaries", () => {
  const counts = parseNumstat("3\t1\tsrc/a.ts\0" + "-\t-\tlogo.png\0" + "2\t0\t\0old.ts\0new.ts\0");
  expect(counts.get("src/a.ts")).toEqual({ added: 3, removed: 1 });
  expect(counts.has("logo.png")).toBe(false);
  expect(counts.get("new.ts")).toEqual({ added: 2, removed: 0 });
});

test("commit onto a new branch and status reports counts and default branch", async () => {
  const directory = await repo();
  await writeFile(path.join(directory, "one.txt"), "one\nmore\n");
  const status = await executeProjectOperation(directory, { kind: "status" });
  expect(status).toMatchObject({ kind: "status", defaultBranch: "main" });
  expect(status.kind === "status" && status.files).toEqual([
    { path: "one.txt", status: " M", added: 1, removed: 0 },
  ]);
  await executeProjectOperation(directory, {
    kind: "commit",
    paths: ["one.txt"],
    message: "on a branch",
    expectedBranch: "main",
    newBranch: "feature/x",
  });
  expect((await git(directory, ["branch", "--show-current"])).trim()).toBe("feature/x");
  expect((await git(directory, ["log", "-1", "--format=%s"])).trim()).toBe("on a branch");
  expect((await git(directory, ["log", "-1", "--format=%s", "main"])).trim()).toBe("initial");
});
