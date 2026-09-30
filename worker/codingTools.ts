import type { SDKCustomTool } from "@cursor/sdk";
import fs from "node:fs/promises";
import path from "node:path";

export type AgentTool = {
  description: string;
  inputSchema: SDKCustomTool["inputSchema"];
  execute: (input: Record<string, unknown>) => Promise<string>;
};

const SHELL_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_CHARS = 100_000;

/** Drain a stream, keeping only the last MAX_OUTPUT_CHARS (with a truncation note). */
async function tailText(stream: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  let truncated = false;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (text.length > MAX_OUTPUT_CHARS * 2) {
      text = text.slice(-MAX_OUTPUT_CHARS);
      truncated = true;
    }
  }
  text += decoder.decode();
  if (text.length > MAX_OUTPUT_CHARS) {
    text = text.slice(-MAX_OUTPUT_CHARS);
    truncated = true;
  }
  return truncated ? `[output truncated, showing last ${MAX_OUTPUT_CHARS} chars]\n${text}` : text;
}

/** Resolve path under cwd; reject escapes. */
export function resolveInCwd(cwd: string, rel: string): string {
  const root = path.resolve(cwd);
  const resolved = path.resolve(root, rel);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`path escapes project cwd: ${rel}`);
  }
  return resolved;
}

export function codingTools(cwd: string): Record<string, AgentTool> {
  return {
    read_file: {
      description: "Read a UTF-8 text file relative to the project cwd.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from project root" },
        },
        required: ["path"],
      },
      async execute(input) {
        const filePath = resolveInCwd(cwd, String(input.path ?? ""));
        return await fs.readFile(filePath, "utf8");
      },
    },
    write_file: {
      description: "Write a UTF-8 text file relative to the project cwd. Creates parent dirs.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" },
          content: { type: "string" },
        },
        required: ["path", "content"],
      },
      async execute(input) {
        const filePath = resolveInCwd(cwd, String(input.path ?? ""));
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, String(input.content ?? ""), "utf8");
        return "ok";
      },
    },
    list_dir: {
      description: "List entries in a directory relative to the project cwd.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Relative directory path; omit or '.' for project root",
          },
        },
      },
      async execute(input) {
        const dirPath = resolveInCwd(cwd, String(input.path ?? "."));
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries
          .map((e) => `${e.isDirectory() ? "d" : "f"} ${e.name}`)
          .join("\n");
      },
    },
    run_shell: {
      description:
        "Run a shell command with cwd set to the project root. Prefer short commands.",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
        required: ["command"],
      },
      async execute(input) {
        const command = String(input.command ?? "");
        // detached => own process group, so the timeout can kill the whole tree.
        const proc = Bun.spawn(["bash", "-lc", command], {
          cwd: path.resolve(cwd),
          stdout: "pipe",
          stderr: "pipe",
          detached: true,
        });
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          try { process.kill(-proc.pid, "SIGKILL"); } catch { proc.kill("SIGKILL"); }
        }, SHELL_TIMEOUT_MS);
        const [stdout, stderr, exitCode] = await Promise.all([
          tailText(proc.stdout),
          tailText(proc.stderr),
          proc.exited,
        ]).finally(() => clearTimeout(timer));
        const parts = [
          timedOut ? `timed out after ${SHELL_TIMEOUT_MS / 60_000} min and was killed` : null,
          exitCode !== 0 ? `exit ${exitCode}` : null,
          stdout.trim() !== "" ? stdout : null,
          stderr.trim() !== "" ? `stderr:\n${stderr}` : null,
        ].filter(Boolean);
        return parts.length > 0 ? parts.join("\n") : "(empty)";
      },
    },
  };
}
