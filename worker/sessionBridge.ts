import { randomBytes, timingSafeEqual } from "node:crypto";
import type { ApiFn } from "../shared/mailboxApi";
import type { Mailbox } from "./mailbox/client";

const reporting = new Set([
  "sessions.bindAgent", "sessions.appendMessage", "sessions.upsertItem",
  "sessions.recordUsage", "sessions.complete", "sessions.fail",
]);
const reading = new Set(["sessions.getStatus", "sessions.getPermission"]);

/** A child receives permission to report on its own Session, never household authority. */
export function startSessionBridge(client: Mailbox, sessionId: string) {
  const token = randomBytes(32).toString("hex");
  let active = true;
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    async fetch(request) {
      const fail = (message: string, status: number) => Response.json({ status: "error", errorMessage: message }, { status });
      const supplied = Buffer.from((request.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
      const expected = Buffer.from(token);
      if (!active || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return fail("Session capability required.", 401);
      const kind = new URL(request.url).pathname;
      if (request.method !== "POST" || !["/api/query", "/api/mutation"].includes(kind)) return fail("Session operation not permitted.", 403);
      const body = await request.text();
      if (body.length > 1024 * 1024) return fail("Session report is too large.", 413);
      try {
        const packet = JSON.parse(body) as { path?: unknown; args?: Record<string, unknown> };
        const allowed = kind === "/api/query" ? reading : reporting;
        if (typeof packet.path !== "string" || !allowed.has(packet.path) || !packet.args || packet.args.sessionId !== sessionId) return fail("Session operation not permitted.", 403);
        const ref = packet.path as ApiFn<Record<string, unknown>, unknown>;
        const value = kind === "/api/query" ? await client.query(ref, packet.args) : await client.mutation(ref, packet.args);
        return Response.json({ status: "success", value });
      } catch (error) {
        return fail(error instanceof Error ? error.message : "Invalid Session report.", 400);
      }
    },
  });
  return {
    workerUrl: `http://127.0.0.1:${server.port}`, token,
    close() { active = false; server.stop(true); },
  };
}
