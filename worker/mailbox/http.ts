import { readFileSync } from "node:fs";
import path from "node:path";
import { dispatch, saveUpload } from "./functions";
import type { Store } from "./store";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
};

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

function tokenOf(request: Request, url: URL) {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim();
  return (url.searchParams.get("token") ?? "").trim();
}

function authorized(request: Request, url: URL, expected: string) {
  return expected !== "" && tokenOf(request, url) === expected;
}

export async function handleMailboxRequest(
  request: Request,
  url: URL,
  input: { store: Store; uploads: string; token: string },
): Promise<Response | null> {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  const origin = `${url.protocol}//${url.host}`;
  if (url.pathname === "/events") {
    if (!authorized(request, url, input.token)) return json({ error: "Pairing token required." }, 401);
    const encoder = new TextEncoder();
    let unsubscribe = () => {};
    const stream = new ReadableStream({
      start(controller) {
        const send = () => controller.enqueue(encoder.encode(`data: ${Date.now()}\n\n`));
        send();
        unsubscribe = input.store.subscribe(send);
      },
      cancel() {
        unsubscribe();
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache", ...cors },
    });
  }
  if (url.pathname === "/upload" && request.method === "POST") {
    if (!authorized(request, url, input.token)) return json({ error: "Pairing token required." }, 401);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > 10 * 1024 * 1024) return json({ error: "Choose an image smaller than 10 MB." }, 400);
    return json({ storageId: saveUpload(input.uploads, bytes) });
  }
  if (url.pathname.startsWith("/uploads/") && request.method === "GET") {
    const id = url.pathname.slice("/uploads/".length);
    if (!/^[A-Za-z0-9_:-]+$/.test(id)) return json({ error: "Not found." }, 404);
    try {
      const file = readFileSync(path.join(input.uploads, id));
      return new Response(file, { headers: { "content-type": "application/octet-stream", ...cors } });
    } catch {
      return json({ error: "Not found." }, 404);
    }
  }
  if (
    (url.pathname === "/api/query" || url.pathname === "/api/mutation" || url.pathname === "/api/action") &&
    request.method === "POST"
  ) {
    if (!authorized(request, url, input.token)) {
      return json({ status: "error", errorMessage: "Pairing token required." }, 401);
    }
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ status: "error", errorMessage: "Invalid body." }, 400);
    const record = body as { path?: unknown; args?: unknown };
    if (typeof record.path !== "string") return json({ status: "error", errorMessage: "Missing path." }, 400);
    const kind = url.pathname.slice("/api/".length) as "query" | "mutation" | "action";
    try {
      const value = await dispatch(kind, record.path, asArgs(record.args), {
        store: input.store,
        origin,
        uploads: input.uploads,
        token: input.token,
      });
      return json({ status: "success", value });
    } catch (error) {
      return json({
        status: "error",
        errorMessage: error instanceof Error ? error.message : "Worker error",
      });
    }
  }
  return null;
}

function asArgs(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
