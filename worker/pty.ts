import { api } from "../shared/mailboxApi";
import type { Mailbox } from "./mailbox/client";
import type { WorkerIdentity } from "./managed";

const SCROLLBACK = 256 * 1024;
const DEFAULT_PORT = 3401;

export type ClientFrame =
  | { type: "attach"; cols: number; rows: number }
  | { type: "write"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "clear" }
  | { type: "close" };

export type ServerFrame =
  | { type: "ready"; cwd: string; cols: number; rows: number; status: string }
  | { type: "replay"; data: string }
  | { type: "data"; data: string }
  | { type: "exit"; code: number }
  | { type: "error"; message: string }
  | { type: "clear" };

export function parseClientFrame(raw: string): ClientFrame | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const frame = value as Record<string, unknown>;
  if (frame.type === "attach" || frame.type === "resize") {
    const cols = frame.cols;
    const rows = frame.rows;
    if (!Number.isInteger(cols) || !Number.isInteger(rows)) return null;
    if ((cols as number) < 1 || (rows as number) < 1) return null;
    if ((cols as number) > 512 || (rows as number) > 512) return null;
    return { type: frame.type, cols: cols as number, rows: rows as number };
  }
  if (frame.type === "write") {
    if (typeof frame.data !== "string" || frame.data.length > 65_536) return null;
    return { type: "write", data: frame.data };
  }
  if (frame.type === "clear" || frame.type === "close") return { type: frame.type };
  return null;
}

export function parseServerFrame(raw: string): ServerFrame | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const frame = value as Record<string, unknown>;
  if (frame.type === "ready") {
    if (typeof frame.cwd !== "string") return null;
    if (!Number.isInteger(frame.cols) || !Number.isInteger(frame.rows)) return null;
    if (typeof frame.status !== "string") return null;
    return {
      type: "ready",
      cwd: frame.cwd,
      cols: frame.cols as number,
      rows: frame.rows as number,
      status: frame.status,
    };
  }
  if (frame.type === "replay" || frame.type === "data") {
    if (typeof frame.data !== "string") return null;
    return { type: frame.type, data: frame.data };
  }
  if (frame.type === "exit") {
    if (!Number.isInteger(frame.code)) return null;
    return { type: "exit", code: frame.code as number };
  }
  if (frame.type === "error") {
    if (typeof frame.message !== "string") return null;
    return { type: "error", message: frame.message };
  }
  if (frame.type === "clear") return { type: "clear" };
  return null;
}

export function appendScrollback(buf: string, chunk: string): string {
  const next = buf + chunk;
  return next.length > SCROLLBACK ? next.slice(-SCROLLBACK) : next;
}

export type PtySocket = { send(data: string): void };

export type PtyProc = {
  pid?: number;
  terminal: { write(data: string): void; resize(cols: number, rows: number): void };
  kill(): void;
  exited: Promise<number>;
};

export type PtySession = {
  proc: PtyProc;
  scrollback: string;
  sockets: Set<PtySocket>;
  cwd: string;
  cols: number;
  rows: number;
  status: "starting" | "running" | "exited";
  exitCode?: number;
};

export function sendFrame(socket: PtySocket, frame: ServerFrame) {
  socket.send(JSON.stringify(frame));
}

export function fanout(session: PtySession, frame: ServerFrame) {
  const raw = JSON.stringify(frame);
  for (const socket of session.sockets) socket.send(raw);
}

export function attachSocket(session: PtySession, socket: PtySocket) {
  session.sockets.add(socket);
  sendFrame(socket, {
    type: "ready",
    cwd: session.cwd,
    cols: session.cols,
    rows: session.rows,
    status: session.status,
  });
  if (session.scrollback) sendFrame(socket, { type: "replay", data: session.scrollback });
}

export function handleClientFrame(session: PtySession, frame: ClientFrame): "close" | void {
  if (frame.type === "write") {
    if (session.status !== "running") return;
    session.proc.terminal.write(frame.data);
    return;
  }
  if (frame.type === "resize") {
    session.cols = frame.cols;
    session.rows = frame.rows;
    if (session.status === "running") session.proc.terminal.resize(frame.cols, frame.rows);
    return;
  }
  if (frame.type === "clear") {
    session.scrollback = "";
    fanout(session, { type: "clear" });
    return;
  }
  if (frame.type === "close") return "close";
}

export function killProcessGroup(pid: number | undefined, kill: () => void) {
  try {
    if (process.platform !== "win32" && pid) process.kill(-pid, "SIGKILL");
    else kill();
  } catch {
    try {
      kill();
    } catch {
      /* already gone */
    }
  }
}

function decodeChunk(chunk: unknown): string {
  if (typeof chunk === "string") return chunk;
  if (chunk instanceof Uint8Array) return new TextDecoder().decode(chunk);
  return "";
}

export function spawnShell(
  cwd: string,
  cols: number,
  rows: number,
  onData: (chunk: string) => void,
): PtyProc {
  const proc = Bun.spawn([process.env.SHELL || "/bin/zsh", "-il"], {
    cwd,
    env: { ...process.env, TERM: "xterm-256color" },
    terminal: {
      cols,
      rows,
      data(_term, chunk) {
        onData(decodeChunk(chunk));
      },
    },
  });
  return {
    pid: proc.pid,
    terminal: proc.terminal!,
    kill: () => proc.kill(),
    exited: proc.exited,
  };
}

type SocketData = { projectId: string; cwd: string };

export function startPtyHub(client: Mailbox, identity: WorkerIdentity) {
  const port = Number(process.env.FACTORY_PTY_PORT ?? DEFAULT_PORT);
  const sessions = new Map<string, PtySession>();

  function drop(projectId: string) {
    const session = sessions.get(projectId);
    if (!session) return;
    sessions.delete(projectId);
    session.status = "exited";
    killProcessGroup(session.proc.pid, () => session.proc.kill());
  }

  function ensureSession(projectId: string, cwd: string, cols: number, rows: number) {
    const existing = sessions.get(projectId);
    if (existing && existing.status !== "exited") {
      existing.cols = cols;
      existing.rows = rows;
      existing.proc.terminal.resize(cols, rows);
      return existing;
    }
    const session: PtySession = {
      proc: spawnShell(cwd, cols, rows, (chunk) => {
        session.scrollback = appendScrollback(session.scrollback, chunk);
        fanout(session, { type: "data", data: chunk });
      }),
      scrollback: "",
      sockets: new Set(),
      cwd,
      cols,
      rows,
      status: "starting",
    };
    session.status = "running";
    sessions.set(projectId, session);
    void session.proc.exited.then((code) => {
      if (sessions.get(projectId) !== session) return;
      session.status = "exited";
      session.exitCode = code;
      fanout(session, { type: "exit", code });
      sessions.delete(projectId);
    });
    return session;
  }

  const server = Bun.serve<SocketData>({
    hostname: "0.0.0.0",
    port,
    async fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname !== "/pty") return new Response("Not found", { status: 404 });
      const ticket = url.searchParams.get("ticket");
      if (!ticket) return new Response("Missing ticket", { status: 401 });
      try {
        const auth = await client.mutation(api.pty.validateTicket, {
          accessKey: identity.accessKey,
          ticket,
        });
        if (
          server.upgrade(req, {
            data: { projectId: auth.projectId, cwd: auth.cwd },
          })
        )
          return;
        return new Response("Upgrade failed", { status: 400 });
      } catch {
        return new Response("Invalid ticket", { status: 401 });
      }
    },
    websocket: {
      open() {},
      message(ws, message) {
        const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
        const frame = parseClientFrame(raw);
        if (!frame) {
          sendFrame(ws, { type: "error", message: "Invalid frame." });
          return;
        }
        if (frame.type === "attach") {
          const session = ensureSession(ws.data.projectId, ws.data.cwd, frame.cols, frame.rows);
          attachSocket(session, ws);
          return;
        }
        const session = sessions.get(ws.data.projectId);
        if (!session) {
          sendFrame(ws, { type: "error", message: "Attach first." });
          return;
        }
        if (handleClientFrame(session, frame) === "close") {
          fanout(session, { type: "exit", code: session.exitCode ?? 0 });
          drop(ws.data.projectId);
        }
      },
      close(ws) {
        const session = sessions.get(ws.data.projectId);
        session?.sockets.delete(ws);
      },
    },
  });

  const wsUrl = `ws://127.0.0.1:${server.port}/pty`;
  void client
    .mutation(api.pty.reportPty, {
      accessKey: identity.accessKey,
      url: wsUrl,
      os: process.platform,
    })
    .catch(() => {
      console.error("PTY hub could not advertise.");
    });

  return () => {
    for (const projectId of [...sessions.keys()]) drop(projectId);
    server.stop(true);
  };
}
