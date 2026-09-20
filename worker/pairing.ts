import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import {
  defaultProjectsRoot,
  identityPath,
  loadIdentity,
  patchIdentity,
  replaceIdentity,
} from "./managed";
import { handleMailboxRequest, json } from "./mailbox/http";
import { openMailbox, uploadsDir } from "./mailbox/store";

const PAIR_PORT = Number(process.env.FACTORY_PAIR_PORT || 3402);

export function pairingPort() {
  return PAIR_PORT;
}

export function pairingUrl(host = lanIPv4() || "127.0.0.1") {
  return `http://${host}:${PAIR_PORT}`;
}

function isTailscale(address: string) {
  const parts = address.split(".").map((part) => Number(part));
  return parts.length === 4 && parts[0] === 100 && (parts[1] ?? 0) >= 64 && (parts[1] ?? 0) <= 127;
}

function lanIPv4() {
  for (const rows of Object.values(os.networkInterfaces())) {
    for (const row of rows ?? []) {
      if (row.internal || row.family !== "IPv4" || isTailscale(row.address)) continue;
      return row.address;
    }
  }
  return "";
}

function tailscaleIPv4() {
  for (const rows of Object.values(os.networkInterfaces())) {
    for (const row of rows ?? []) {
      if (row.internal || row.family !== "IPv4" || !isTailscale(row.address)) continue;
      return row.address;
    }
  }
  return "";
}

async function pickFolder(): Promise<string> {
  if (process.platform !== "darwin") throw new Error("Folder picker is only on the Mac Worker.");
  const script = 'POSIX path of (choose folder with prompt "Choose a Project checkout")';
  const proc = Bun.spawn(["osascript", "-e", script], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(err.trim() || "Folder picker cancelled.");
  return out.trim().replace(/\/$/, "");
}

export async function startPairingHub(root: string) {
  await loadIdentity(root);
  const store = openMailbox(root);
  const uploads = uploadsDir(root);
  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
    hostname: "0.0.0.0",
    port: PAIR_PORT,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-allow-headers": "content-type,authorization",
          },
        });
      }
      const identity = await loadIdentity(root).catch(() => null);
      const mailbox = await handleMailboxRequest(request, url, {
        store,
        uploads,
        token: identity?.pairingToken ?? "",
      });
      if (mailbox) return mailbox;
      if (url.pathname === "/health") return json({ ok: true });
      if (url.pathname === "/pair") {
        if (!identity) return json({ error: "This Worker is still starting." }, 409);
        const tailscale = tailscaleIPv4();
        return json({
          workerUrl: pairingUrl(),
          token: identity.pairingToken,
          name: identity.name,
          projectsRoot: identity.projectsRoot,
          lan: pairingUrl(),
          tailscale: tailscale ? pairingUrl(tailscale) : "",
          tunnel: identity.tunnelUrl ?? "",
        });
      }
      if (url.pathname === "/pick-folder" && request.method === "POST") {
        try {
          return json({ path: await pickFolder() });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Picker failed." }, 400);
        }
      }
      if (url.pathname === "/replace" && request.method === "POST") {
        await replaceIdentity(root);
        return json({ ok: true });
      }
      if (url.pathname === "/settings" && request.method === "POST") {
        const body: unknown = await request.json().catch(() => null);
        if (!body || typeof body !== "object") return json({ error: "Invalid body." }, 400);
        const record = body as Record<string, unknown>;
        const patch: { projectsRoot?: string; keepAwake?: boolean; tunnelUrl?: string } = {};
        if (typeof record.projectsRoot === "string" && record.projectsRoot.trim()) {
          patch.projectsRoot = path.resolve(record.projectsRoot.trim());
        }
        if (typeof record.keepAwake === "boolean") patch.keepAwake = record.keepAwake;
        if (typeof record.tunnelUrl === "string") {
          const next = record.tunnelUrl.trim().replace(/\/$/, "");
          if (next && !next.startsWith("https://") && !next.startsWith("http://")) {
            return json({ error: "Tunnel URL must start with http:// or https://." }, 400);
          }
          patch.tunnelUrl = next;
        }
        try {
          const next = await patchIdentity(root, patch);
          return json({
            ok: true,
            projectsRoot: next.projectsRoot,
            keepAwake: next.keepAwake !== false,
            tunnelUrl: next.tunnelUrl ?? "",
          });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Could not save." }, 400);
        }
      }
      if (url.pathname === "/status") {
        const file = identityPath(root);
        const exists = await Bun.file(file).exists();
        const live = exists ? await loadIdentity(root) : null;
        const tailscale = tailscaleIPv4();
        return json({
          paired: exists,
          pairing: pairingUrl(),
          tailscale: tailscale ? pairingUrl(tailscale) : "",
          tunnel: live?.tunnelUrl ?? "",
          projectsRoot: live?.projectsRoot ?? defaultProjectsRoot(),
          keepAwake: live?.keepAwake !== false,
          host: os.hostname(),
          lan: lanIPv4(),
          port: PAIR_PORT,
        });
      }
      return json({ error: "Not found." }, 404);
    },
  });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/port|EADDRINUSE|in use/i.test(message)) {
      throw new Error(`Port ${PAIR_PORT} is already in use. Stop the other Factory Worker, then start again.`);
    }
    throw error;
  }
  console.log(`Factory pairing on ${pairingUrl()}`);
  return () => server.stop();
}

export function setKeepAwake(on: boolean) {
  if (process.platform !== "darwin") return;
  if (!on) {
    spawn("killall", ["caffeinate"], { stdio: "ignore" });
    return;
  }
  spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore", detached: true }).unref();
}
