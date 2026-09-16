import { spawn } from "node:child_process";
import path from "node:path";
import { realpath } from "node:fs/promises";
import type { ConvexHttpClient } from "convex/browser";
import type { Infer } from "convex/values";
import { api } from "../convex/_generated/api";
import {
  operationResult,
  projectOperation,
} from "../convex/lib/projectOperations";
import type { WorkerIdentity } from "./managed";

type Operation = Infer<typeof projectOperation>;
type Result = Infer<typeof operationResult>;
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
  if (operation.kind === "status") {
    const branch = await git(["symbolic-ref", "--short", "-q", "HEAD"], [0, 1]);
    const status = await git([
      "status",
      "--porcelain=v1",
      "-z",
      "--untracked-files=all",
    ]);
    return {
      kind: "status",
      branch: branch.text.trim() || "Detached HEAD",
      files: parseGitStatus(status.text),
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
  if (operation.expectedBranch) {
    const branch =
      (
        await git(["symbolic-ref", "--short", "-q", "HEAD"], [0, 1])
      ).text.trim() || "Detached HEAD";
    if (branch !== operation.expectedBranch)
      throw new Error("The branch changed. Refresh Changes before committing.");
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

export function startProjectOperations(
  client: ConvexHttpClient,
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
