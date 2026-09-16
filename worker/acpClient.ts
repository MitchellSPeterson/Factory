export type JsonRpcId = number | string;

type JsonRpcError = { code: number; message: string; data?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonRpcId(value: unknown): value is JsonRpcId {
  return typeof value === "number" || typeof value === "string";
}

export type AcpIncoming =
  | { kind: "response"; id: JsonRpcId; result: unknown }
  | { kind: "error"; id: JsonRpcId; error: JsonRpcError }
  | { kind: "request"; id: JsonRpcId; method: string; params: unknown }
  | { kind: "notification"; method: string; params: unknown };

export function parseAcpLine(line: string): AcpIncoming | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.jsonrpc !== "2.0") return null;
  if (typeof value.method === "string") {
    if (isJsonRpcId(value.id)) {
      return { kind: "request", id: value.id, method: value.method, params: value.params };
    }
    return { kind: "notification", method: value.method, params: value.params };
  }
  if (!isJsonRpcId(value.id)) return null;
  if (isRecord(value.error) && typeof value.error.code === "number" && typeof value.error.message === "string") {
    return {
      kind: "error",
      id: value.id,
      error: { code: value.error.code, message: value.error.message, data: value.error.data },
    };
  }
  return { kind: "response", id: value.id, result: value.result };
}

export function encodeAcpMessage(message: Record<string, unknown>): string {
  return `${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`;
}

export type AcpClientHandlers = {
  onRequest: (method: string, params: unknown, id: JsonRpcId) => Promise<unknown>;
  onNotification: (method: string, params: unknown) => void;
};

export type AcpProcess = {
  stdin: { write: (chunk: string) => void; end: () => void };
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  exited: Promise<number>;
  kill: () => void;
};

export function createAcpClient(proc: AcpProcess, handlers: AcpClientHandlers) {
  let nextId = 1;
  const pending = new Map<JsonRpcId, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  let closed = false;
  let stderrText = "";

  const write = (message: Record<string, unknown>) => {
    if (closed) throw new Error("ACP connection is closed.");
    proc.stdin.write(encodeAcpMessage(message));
  };

  const failAll = (error: Error) => {
    closed = true;
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  };

  const handle = (incoming: AcpIncoming) => {
    if (incoming.kind === "response") {
      const waiter = pending.get(incoming.id);
      if (!waiter) return;
      pending.delete(incoming.id);
      waiter.resolve(incoming.result);
      return;
    }
    if (incoming.kind === "error") {
      const waiter = pending.get(incoming.id);
      if (!waiter) return;
      pending.delete(incoming.id);
      waiter.reject(new Error(incoming.error.message));
      return;
    }
    if (incoming.kind === "notification") {
      handlers.onNotification(incoming.method, incoming.params);
      return;
    }
    void handlers.onRequest(incoming.method, incoming.params, incoming.id).then(
      (result) => {
        if (closed) return;
        write({ id: incoming.id, result: result ?? null });
      },
      (error: unknown) => {
        if (closed) return;
        const message = error instanceof Error ? error.message : "ACP request failed.";
        write({ id: incoming.id, error: { code: -32603, message } });
      },
    );
  };

  const readStdout = (async () => {
    const reader = proc.stdout.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const incoming = parseAcpLine(line);
        if (incoming) handle(incoming);
      }
    }
    const last = parseAcpLine(buffer);
    if (last) handle(last);
  })();

  const readStderr = (async () => {
    stderrText = await new Response(proc.stderr).text();
  })();

  const done = Promise.all([readStdout, readStderr, proc.exited]).then(([, , code]) => {
    if (!closed) {
      failAll(new Error(code === 0 ? "ACP agent closed the connection." : `ACP agent exited with code ${code}.`));
    }
    return code;
  });

  return {
    request(method: string, params?: unknown): Promise<unknown> {
      const id = nextId;
      nextId += 1;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        try {
          write({ id, method, params: params ?? {} });
        } catch (error) {
          pending.delete(id);
          reject(error instanceof Error ? error : new Error("ACP write failed."));
        }
      });
    },
    notify(method: string, params?: unknown) {
      write({ method, params: params ?? {} });
    },
    stderr() {
      return stderrText;
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        proc.stdin.end();
      } catch {
        // already closed
      }
      proc.kill();
      failAll(new Error("ACP connection closed."));
      await done.catch(() => undefined);
    },
    done,
  };
}
