import { statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { api } from "../shared/mailboxApi";
import type { Id } from "../shared/ids";
import type { Mailbox } from "./mailbox/client";

export function openShell({
  cwd,
  cols,
  rows,
  shell = process.env.SHELL || "/bin/bash",
}: {
  cwd: string;
  cols: number;
  rows: number;
  shell?: string;
}) {
  try {
    if (!statSync(cwd).isDirectory()) throw new Error();
  } catch {
    throw new Error(
      `Project directory is unavailable: ${cwd}. Update the Project path in Settings.`,
    );
  }
  let output = "";
  let outputEnd = 0;
  let exit: string | undefined;
  let closed = false;
  const proc = Bun.spawn(
    [
      "node",
      fileURLToPath(new URL("./terminalProcess.cjs", import.meta.url)),
      cwd,
      shell,
      String(cols),
      String(rows),
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe" },
  );
  async function read() {
    let buffer = "";
    const decoder = new TextDecoder();
    const reader = proc.stdout.getReader();
    for (;;) {
      const { value: chunk, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(chunk, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const value: unknown = JSON.parse(line);
        if (!value || typeof value !== "object" || !("type" in value)) continue;
        if (
          value.type === "data" &&
          "data" in value &&
          typeof value.data === "string"
        ) {
          outputEnd += value.data.length;
          output = (output + value.data).slice(-65_536);
        }
        if (
          value.type === "exit" &&
          "exitCode" in value &&
          typeof value.exitCode === "number"
        )
          exit = `Shell exited with code ${value.exitCode}.`;
      }
    }
  }
  const reading = read().catch(() => {
    exit = "Terminal stream failed.";
  });
  void (async () => {
    const errors = await new Response(proc.stderr).text();
    await proc.exited;
    await reading;
    exit ??= errors.trim().slice(-1000) || "Shell disconnected.";
  })();
  function send(value: object) {
    if (!closed && !exit) proc.stdin.write(JSON.stringify(value) + "\n");
  }
  return {
    snapshot: () => ({ output, outputEnd, exit }),
    write: (data: string) => send({ type: "input", data }),
    resize: (cols: number, rows: number) =>
      send({ type: "resize", cols, rows }),
    close() {
      if (closed) return;
      closed = true;
      proc.stdin.end();
    },
  };
}

export function startTerminals(
  client: Mailbox,
  identity: { accessKey: string },
) {
  const owner = crypto.randomUUID();
  const auth = { accessKey: identity.accessKey, owner };
  const shells = new Map<Id<"terminals">, ReturnType<typeof openShell>>();
  const started = new Set<Id<"terminals">>();
  let stopped = false;
  async function run(id: Id<"terminals">, shell: ReturnType<typeof openShell>) {
    let inputAck = 0;
    let outputAck = -1;
    let lastSuccess = Date.now();
    let cols = 0;
    let rows = 0;
    try {
      while (!stopped) {
        try {
          const snapshot = shell.snapshot();
          const result = await client.mutation(api.terminals.exchange, {
            ...auth,
            id,
            inputAck,
            ...snapshot,
            output: snapshot.outputEnd === outputAck ? "" : snapshot.output,
          });
          if (!result || snapshot.exit !== undefined) break;
          lastSuccess = Date.now();
          outputAck = snapshot.outputEnd;
          if (cols !== result.cols || rows !== result.rows) {
            shell.resize(result.cols, result.rows);
            cols = result.cols;
            rows = result.rows;
          }
          const data = result.input.slice(
            Math.max(0, inputAck - (result.inputEnd - result.input.length)),
          );
          if (data) shell.write(data);
          inputAck = result.inputEnd;
        } catch {
          if (Date.now() - lastSuccess > 15_000) break;
        }
        await Bun.sleep(150);
      }
    } finally {
      shell.close();
      shells.delete(id);
    }
  }
  async function poll() {
    while (!stopped) {
      try {
        const tabs = await client.mutation(api.terminals.claim, auth);
        for (const tab of tabs) {
          if (stopped || started.has(tab._id)) continue;
          started.add(tab._id);
          try {
            const shell = openShell({
              cwd: tab.localPath,
              cols: tab.cols,
              rows: tab.rows,
            });
            shells.set(tab._id, shell);
            void run(tab._id, shell);
          } catch (error) {
            await client.mutation(api.terminals.exchange, {
              ...auth,
              id: tab._id,
              inputAck: 0,
              output: "",
              outputEnd: 0,
              exit:
                error instanceof Error
                  ? error.message
                  : "Shell could not start.",
            });
          }
        }
      } catch {
        console.error("Terminal synchronization failed; retrying.");
      }
      await Bun.sleep(1000);
    }
  }
  void poll();
  return () => {
    stopped = true;
    for (const shell of shells.values()) shell.close();
  };
}
