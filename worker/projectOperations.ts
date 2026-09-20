import { spawn } from "node:child_process";
import path from "node:path";
import { realpath } from "node:fs/promises";
import { api } from "../shared/mailboxApi";
import type { OperationResult, ProjectOperation } from "../shared/projectOperations";
import type { Mailbox } from "./mailbox/client";
import type { WorkerIdentity } from "./managed";

type Operation = ProjectOperation;
type Result = OperationResult;
type GitBranch = {
  name: string;
  current: boolean;
  remote: boolean;
  upstream?: string;
  ahead: number;
  behind: number;
  gone: boolean;
  worktreePath?: string;
};
type GitWorktree = {
  path: string;
  head: string;
  branch?: string;
  bare: boolean;
  locked: boolean;
  prunable: boolean;
  current: boolean;
};
type GitCommit = {
  sha: string;
  subject: string;
  author: string;
  committedAt: number;
};
export function parseGitStatus(raw: string) {
  const records = raw.split("\0");
  const files: { path: string; status: string; originalPath?: string }[] = [];
  for (let i = 0; i < records.length; i++) {
    const entry = records[i];
    if (!entry || entry.length < 4) continue;
    const status = entry.slice(0, 2);
    const file = entry.slice(3);
    const originalPath =
      status.includes("R") || status.includes("C") ? records[++i] : undefined;
    files.push({
      path: file,
      status,
      ...(originalPath ? { originalPath } : {}),
    });
  }
  return files;
}
export function validateGitPath(file: string) {
  if (
    !file ||
    path.isAbsolute(file) ||
    file
      .split(/[\\/]/)
      .some((part) => part === ".." || part.toLowerCase() === ".git") ||
    file.includes("\0")
  )
    throw new Error("Invalid repository path.");
  return file;
}
export function validateBranchName(name: string) {
  const trimmed = name.trim();
  if (
    !trimmed ||
    trimmed.length > 255 ||
    trimmed.startsWith("-") ||
    trimmed.includes("\0") ||
    trimmed.includes("..") ||
    trimmed.includes(" ") ||
    trimmed.includes(":") ||
    trimmed.includes("~") ||
    trimmed.includes("^") ||
    trimmed.includes("?") ||
    trimmed.includes("*") ||
    trimmed.includes("[") ||
    trimmed.endsWith(".lock") ||
    trimmed.endsWith("/") ||
    trimmed.startsWith("/")
  )
    throw new Error("Enter a valid branch name.");
  return trimmed;
}
export function validateWorktreeName(name: string) {
  const trimmed = name.trim();
  if (!/^[A-Za-z0-9._-]+$/.test(trimmed) || trimmed.length > 80)
    throw new Error(
      "Worktree names can use letters, numbers, dots, dashes, and underscores.",
    );
  return trimmed;
}
export function parseTrack(raw: string) {
  const track = raw.trim();
  if (track === "gone") return { ahead: 0, behind: 0, gone: true };
  const ahead = /ahead (\d+)/.exec(track);
  const behind = /behind (\d+)/.exec(track);
  return {
    ahead: ahead ? Number(ahead[1]) : 0,
    behind: behind ? Number(behind[1]) : 0,
    gone: false,
  };
}
export function parseForEachRef(raw: string): GitBranch[] {
  const branches: GitBranch[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const [refname, short, head, , upstream, track, worktreePath] =
      line.split("\0");
    if (!refname || !short) continue;
    if (refname.startsWith("refs/remotes/") && short.endsWith("/HEAD"))
      continue;
    const remote = refname.startsWith("refs/remotes/");
    const { ahead, behind, gone } = parseTrack(track ?? "");
    branches.push({
      name: short,
      current: head === "*",
      remote,
      ...(upstream ? { upstream } : {}),
      ahead,
      behind,
      gone,
      ...(worktreePath ? { worktreePath } : {}),
    });
  }
  return branches;
}
export function parseWorktrees(raw: string, currentPath: string): GitWorktree[] {
  const normalized = path.resolve(currentPath);
  const worktrees: GitWorktree[] = [];
  for (const block of raw.split("\n\n")) {
    const lines = block.split("\n").filter(Boolean);
    if (!lines[0]?.startsWith("worktree ")) continue;
    const treePath = lines[0].slice("worktree ".length);
    let head = "";
    let branch: string | undefined;
    let bare = false;
    let locked = false;
    let prunable = false;
    for (const line of lines.slice(1)) {
      if (line.startsWith("HEAD ")) head = line.slice("HEAD ".length);
      else if (line.startsWith("branch ")) {
        const ref = line.slice("branch ".length);
        branch = ref.startsWith("refs/heads/")
          ? ref.slice("refs/heads/".length)
          : ref;
      } else if (line === "bare") bare = true;
      else if (line === "detached") branch = undefined;
      else if (line === "locked" || line.startsWith("locked ")) locked = true;
      else if (line === "prunable" || line.startsWith("prunable "))
        prunable = true;
    }
    worktrees.push({
      path: treePath,
      head,
      ...(branch ? { branch } : {}),
      bare,
      locked,
      prunable,
      current: path.resolve(treePath) === normalized,
    });
  }
  return worktrees;
}
async function markCurrentWorktrees(worktrees: GitWorktree[], directory: string) {
  return await Promise.all(
    worktrees.map(async (item) => {
      try {
        return { ...item, current: (await realpath(item.path)) === directory };
      } catch {
        return { ...item, current: path.resolve(item.path) === directory };
      }
    }),
  );
}
function localNameFromRemote(name: string) {
  const slash = name.indexOf("/");
  return slash === -1 ? name : name.slice(slash + 1);
}
async function switchRemote(
  git: (args: string[], allowed?: number[]) => Promise<{ text: string; code: number }>,
  refs: GitBranch[],
  branch: string,
) {
  const local = localNameFromRemote(branch);
  if (refs.some((item) => !item.remote && item.name === local))
    return await git(["switch", "--", local]);
  return await git(["switch", "-c", local, "--track", branch]);
}
export function parseLog(raw: string): GitCommit[] {
  const commits: GitCommit[] = [];
  for (const record of raw.split("\x1e")) {
    if (!record.trim()) continue;
    const [sha, subject, author, committedAt] = record
      .replace(/^\n/, "")
      .split("\0");
    if (!sha) continue;
    const at = Number(committedAt);
    commits.push({
      sha,
      subject: subject ?? "",
      author: author ?? "",
      committedAt: Number.isFinite(at) ? at : 0,
    });
  }
  return commits;
}
export async function executeProjectOperation(
  cwd: string,
  operation: Operation,
  onOutput: (text: string) => void = () => {},
  signal?: AbortSignal,
): Promise<Result> {
  const directory = await realpath(cwd);
  async function run(args: string[], allowed = [0], terminal = false) {
    if (signal?.aborted) throw new Error("Command cancelled.");
    return await new Promise<{ text: string; code: number }>(
      (resolve, reject) => {
        const proc = spawn(args[0]!, args.slice(1), {
          cwd: directory,
          detached: process.platform !== "win32",
          env: {
            ...process.env,
            GIT_TERMINAL_PROMPT: "0",
            GIT_LITERAL_PATHSPECS: "1",
            NO_COLOR: "1",
            TERM: "dumb",
          },
          stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        let overflow = false;
        let timedOut = false;
        const kill = () => {
          try {
            if (process.platform !== "win32" && proc.pid)
              process.kill(-proc.pid, "SIGKILL");
            else proc.kill("SIGKILL");
          } catch {
            /* Process already exited. */
          }
        };
        const timer = setTimeout(() => {
          timedOut = true;
          kill();
        }, 120_000);
        signal?.addEventListener("abort", kill, { once: true });
        const append = (chunk: Buffer) => {
          output += chunk.toString();
          if (output.length > 100_000) {
            output = output.slice(-100_000);
            overflow = true;
          }
          if (terminal)
            onOutput((overflow ? "[Earlier output truncated]\n" : "") + output);
        };
        proc.stdout.on("data", append);
        proc.stderr.on("data", append);
        const clean = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", kill);
        };
        proc.on("error", (error) => {
          clean();
          reject(error);
        });
        proc.on("close", (code) => {
          clean();
          if (signal?.aborted) return reject(new Error("Command cancelled."));
          if (timedOut)
            return reject(new Error("Command stopped after two minutes."));
          if (overflow && !terminal)
            return reject(
              new Error(
                "Result exceeds the preview limit. Use the terminal to inspect this repository.",
              ),
            );
          if (!terminal && !allowed.includes(code ?? 1))
            return reject(new Error(output.trim() || "Git command failed."));
          resolve({
            text: (overflow ? "[Earlier output truncated]\n" : "") + output,
            code: code ?? 1,
          });
        });
      },
    );
  }
  const git = (args: string[], allowed?: number[]) =>
    run(["git", "--no-pager", ...args], allowed);
  if (operation.kind === "terminal") {
    const result = await run(
      [process.env.SHELL || "/bin/sh", "-lc", operation.command],
      [],
      true,
    );
    return { kind: "text", text: result.text, exitCode: result.code };
  }
  await git(["rev-parse", "--show-toplevel"]);
  async function requireClean(action: string) {
    const status = parseGitStatus(
      (await git(["status", "--porcelain=v1", "-z"])).text,
    );
    if (status.length)
      throw new Error(`Commit or stash these changes before ${action}.`);
  }
  async function requireRef(name: string) {
    const formatted = await git(["check-ref-format", "--branch", name]);
    return formatted.text.trim() || name;
  }
  if (operation.kind === "status") {
    const status = await git([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ]);
    const [symbolic, head, refs, worktrees, log, remotes] = await Promise.all([
      git(["symbolic-ref", "--short", "-q", "HEAD"], [0, 1]),
      git(["rev-parse", "HEAD"], [0, 1, 128]),
      git([
        "for-each-ref",
        "--format=%(refname)%00%(refname:short)%00%(HEAD)%00%(objectname)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(worktreepath)",
        "refs/heads",
        "refs/remotes",
      ]),
      git(["worktree", "list", "--porcelain"]),
      git(["log", "-30", "--format=%H%x00%s%x00%an%x00%ct%x1e"], [0, 128]),
      git(["remote"]),
    ]);
    const detached = symbolic.code !== 0 || !symbolic.text.trim();
    const branch = detached ? "Detached HEAD" : symbolic.text.trim();
    const current = parseForEachRef(refs.text).find((item) => item.current);
    return {
      kind: "status",
      branch,
      files: parseGitStatus(status.text),
      ...(head.code === 0 && head.text.trim()
        ? { head: head.text.trim() }
        : {}),
      detached,
      ...(current?.upstream ? { upstream: current.upstream } : {}),
      ahead: current?.ahead ?? 0,
      behind: current?.behind ?? 0,
      gone: current?.gone ?? false,
      remotes: remotes.text
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
      branches: parseForEachRef(refs.text),
      worktrees: await markCurrentWorktrees(
        parseWorktrees(worktrees.text, directory),
        directory,
      ),
      commits: parseLog(log.text),
    };
  }
  if (operation.kind === "diff") {
    const file = validateGitPath(operation.path);
    const status = parseGitStatus(
      (await git(["status", "--porcelain=v1", "-z", "--", file])).text,
    );
    if (status.some((item) => item.status === "??")) {
      const resolved = await realpath(path.join(directory, file));
      if (!resolved.startsWith(directory + path.sep))
        throw new Error("File points outside this Project.");
      const diff = await git(
        [
          "diff",
          "--no-ext-diff",
          "--no-textconv",
          "--no-index",
          "--",
          "/dev/null",
          file,
        ],
        [0, 1],
      );
      return { kind: "text", text: diff.text, exitCode: 0 };
    }
    const staged = await git([
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--cached",
      "--",
      file,
    ]);
    const working = await git([
      "diff",
      "--no-ext-diff",
      "--no-textconv",
      "--",
      file,
    ]);
    return {
      kind: "text",
      text:
        [
          staged.text && `Staged\n${staged.text}`,
          working.text && `Working tree\n${working.text}`,
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 100_000) ||
        "No text changes. This file may be binary or unchanged.",
      exitCode: 0,
    };
  }
  if (operation.kind === "commit") {
    if (operation.expectedBranch) {
      const branch =
        (
          await git(["symbolic-ref", "--short", "-q", "HEAD"], [0, 1])
        ).text.trim() || "Detached HEAD";
      if (branch !== operation.expectedBranch)
        throw new Error(
          "The branch changed. Refresh Changes before committing.",
        );
    }
    const files = operation.paths.map(validateGitPath);
    if (!files.length || !operation.message.trim())
      throw new Error("Select files and enter a commit message.");
    const status = parseGitStatus(
      (await git(["status", "--porcelain=v1", "-z"])).text,
    );
    const originals = status
      .filter((item) => files.includes(item.path) && item.status.includes("R"))
      .flatMap((item) =>
        item.originalPath ? [validateGitPath(item.originalPath)] : [],
      );
    await git(["add", "--", ...files]);
    const commit = await git([
      "commit",
      "--only",
      "-m",
      operation.message,
      "--",
      ...new Set([...files, ...originals]),
    ]);
    return { kind: "text", text: commit.text, exitCode: 0 };
  }
  if (operation.kind === "checkout") {
    const branch = await requireRef(validateBranchName(operation.branch));
    await requireClean("switching branches");
    const refs = parseForEachRef(
      (
        await git([
          "for-each-ref",
          "--format=%(refname)%00%(refname:short)%00%(HEAD)%00%(objectname)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(worktreepath)",
          "refs/heads",
          "refs/remotes",
        ])
      ).text,
    );
    const match = refs.find((item) => item.name === branch);
    const switched = match?.remote
      ? await switchRemote(git, refs, branch)
      : await git(["switch", "--", branch]);
    return {
      kind: "text",
      text: switched.text.trim() || `On ${branch}.`,
      exitCode: 0,
    };
  }
  if (operation.kind === "createBranch") {
    const name = await requireRef(validateBranchName(operation.name));
    if (operation.checkout) {
      await requireClean("switching branches");
      const created = await git(["switch", "-c", name]);
      return {
        kind: "text",
        text: created.text.trim() || `Created ${name}.`,
        exitCode: 0,
      };
    }
    await git(["branch", "--", name]);
    return { kind: "text", text: `Created ${name}.`, exitCode: 0 };
  }
  if (operation.kind === "createWorktree") {
    const name = validateWorktreeName(operation.name);
    const branch = await requireRef(validateBranchName(operation.branch));
    const parent = path.dirname(directory);
    const target = path.resolve(parent, `${path.basename(directory)}-${name}`);
    if (target === directory || !target.startsWith(parent + path.sep))
      throw new Error("Worktree path is outside this Project.");
    const created = operation.createBranch
      ? await git(["worktree", "add", "-b", branch, target])
      : await git(["worktree", "add", target, branch]);
    return {
      kind: "text",
      text: created.text.trim() || `Worktree at ${target}.`,
      exitCode: 0,
    };
  }
  if (operation.kind === "removeWorktree") {
    if (!operation.path || operation.path.includes("\0"))
      throw new Error("Choose a worktree to remove.");
    const listed = parseWorktrees(
      (await git(["worktree", "list", "--porcelain"])).text,
      directory,
    );
    const match = listed.find(
      (item) => path.resolve(item.path) === path.resolve(operation.path),
    );
    if (!match) throw new Error("Unknown worktree.");
    if (match.current)
      throw new Error("Cannot remove the worktree this Project is using.");
    const removed = await git(["worktree", "remove", "--", match.path]);
    return {
      kind: "text",
      text: removed.text.trim() || `Removed ${match.path}.`,
      exitCode: 0,
    };
  }
  if (operation.kind === "fetch") {
    const fetched = await git(["fetch", "--all", "--prune"]);
    return {
      kind: "text",
      text: fetched.text.trim() || "Fetched.",
      exitCode: 0,
    };
  }
  if (operation.kind === "pull") {
    await requireClean("pulling");
    const pulled = await git(["pull", "--ff-only", "--no-rebase"]);
    return {
      kind: "text",
      text: pulled.text.trim() || "Pulled.",
      exitCode: 0,
    };
  }
  if (operation.kind === "push") {
    const upstream = await git(
      ["rev-parse", "--abbrev-ref", "@{upstream}"],
      [0, 1, 128],
    );
    const remotes = (await git(["remote"])).text
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    if (upstream.code !== 0 || !upstream.text.trim()) {
      if (!remotes.includes("origin"))
        throw new Error("No remote is configured.");
    }
    const pushed =
      upstream.code === 0 && upstream.text.trim()
        ? await git(["push"])
        : await git(["push", "-u", "origin", "HEAD"]);
    return {
      kind: "text",
      text: pushed.text.trim() || "Pushed.",
      exitCode: 0,
    };
  }
  const _exhaustive: never = operation;
  return _exhaustive;
}

export function startProjectOperations(
  client: Mailbox,
  identity: WorkerIdentity,
) {
  let stopped = false;
  const controllers = new Set<AbortController>();
  async function loop() {
    while (!stopped) {
      try {
        const task = await client.mutation(api.projectOperations.claim, {
          accessKey: identity.accessKey,
        });
        if (task) {
          const controller = new AbortController();
          controllers.add(controller);
          let output = "";
          let syncing = false;
          const sync = setInterval(() => {
            if (syncing) return;
            syncing = true;
            void client
              .mutation(api.projectOperations.update, {
                accessKey: identity.accessKey,
                id: task._id,
                output,
              })
              .then((active) => {
                if (!active) controller.abort();
              })
              .catch(() => controller.abort())
              .finally(() => {
                syncing = false;
              });
          }, 700);
          try {
            const result = await executeProjectOperation(
              task.localPath,
              task.operation,
              (text) => {
                output = text;
              },
              controller.signal,
            );
            clearInterval(sync);
            await client.mutation(api.projectOperations.update, {
              accessKey: identity.accessKey,
              id: task._id,
              output,
              result,
            });
          } catch (error) {
            clearInterval(sync);
            await client.mutation(api.projectOperations.update, {
              accessKey: identity.accessKey,
              id: task._id,
              output,
              error: error instanceof Error ? error.message : "Command failed.",
            });
          } finally {
            clearInterval(sync);
            controllers.delete(controller);
          }
        }
      } catch {
        console.error("Project commands could not synchronize; retrying.");
      }
      await Bun.sleep(1000);
    }
  }
  for (let i = 0; i < 3; i++) void loop();
  return () => {
    stopped = true;
    for (const controller of controllers) controller.abort();
  };
}
