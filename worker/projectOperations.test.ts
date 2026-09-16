import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  executeProjectOperation,
  parseGitStatus,
  validateGitPath,
} from "./projectOperations";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function repo() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "factory-git-test-"));
  directories.push(directory);
  await git(directory, ["init"]);
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
