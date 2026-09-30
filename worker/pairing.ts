import { spawn } from "node:child_process";
import { randomInt, timingSafeEqual } from "node:crypto";
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

// The exported Expo web app (`bun run build:web`). Paths without an extension are
// app routes, so they get index.html and expo-router takes it from there.
export async function serveWeb(dir: string, pathname: string) {
  let file = "";
  try {
    file = path.join(dir, decodeURIComponent(pathname));
  } catch {
    return json({ error: "Not found." }, 404);
  }
  if (!file.startsWith(dir + path.sep)) return json({ error: "Not found." }, 404);
  if (path.extname(file)) {
    const asset = Bun.file(file);
    return (await asset.exists()) ? new Response(asset) : json({ error: "Not found." }, 404);
  }
  const index = Bun.file(path.join(dir, "index.html"));
  if (await index.exists()) return new Response(index);
  return new Response("Factory web app is not built yet. Run `bun run build:web`, then reload.", {
    status: 503,
    headers: { "content-type": "text/plain" },
  });
}

const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostnameOf(value: string | null) {
  if (!value) return "";
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// Rejects DNS-rebinding: a browser page on evil.com resolved to this Mac still sends Host: evil.com.
export function hostAllowed(host: string, tunnelUrl = "") {
  const name = hostnameOf(host);
  if (!name) return false;
  if (LOOPBACK_NAMES.has(name) || /^[\d.]+$/.test(name) || name.startsWith("[")) return true;
  if (name.endsWith(".local") || name.endsWith(".ts.net") || name === os.hostname().toLowerCase()) return true;
  return name === hostnameOf(tunnelUrl);
}

// Admin routes answer only to this Mac: loopback socket, loopback Host (so a tunnel forwarding
// to localhost doesn't count), and no foreign browser Origin.
export function isLocalAdmin(request: Request, ip: string | undefined) {
  if (!ip || !LOOPBACK_IPS.has(ip)) return false;
  if (!LOOPBACK_NAMES.has(hostnameOf(request.headers.get("host")))) return false;
  const origin = request.headers.get("origin");
  return !origin || LOOPBACK_NAMES.has(hostnameOf(origin));
}

function localCors(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin || !LOOPBACK_NAMES.has(hostnameOf(origin))) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
    vary: "origin",
  };
}

// Pairing/admin responses must not carry the mailbox's `*` CORS header, or any web page could read them.
function localJson(request: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...localCors(request) },
  });
}

const PAIR_CODE_TTL_MS = 10 * 60_000;
const PAIR_CODE_MAX_FAILURES = 5;
let pairCode = "";
let pairCodeAt = 0;
let pairFailures = 0;

function rotatePairCode() {
  pairCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
  pairCodeAt = Date.now();
  pairFailures = 0;
  console.log(`Factory pairing code: ${pairCode}`);
}

export function currentPairCode() {
  if (!pairCode || Date.now() - pairCodeAt > PAIR_CODE_TTL_MS) rotatePairCode();
  return pairCode;
}

// One-time code a phone must present to fetch the token remotely. Rotates on use, on expiry,
// and after a few wrong guesses so the 6-digit space can't be brute-forced.
export function redeemPairCode(input: string) {
  const expected = Buffer.from(currentPairCode());
  const given = Buffer.from(input.trim());
  if (given.length === expected.length && timingSafeEqual(given, expected)) {
    rotatePairCode();
    return true;
  }
  pairFailures += 1;
  if (pairFailures >= PAIR_CODE_MAX_FAILURES) rotatePairCode();
  return false;
}

export async function startPairingHub(root: string) {
  await loadIdentity(root);
  const store = openMailbox(root);
  const uploads = uploadsDir(root);
  const webDir = path.join(root, "expo", "dist");
  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
    hostname: "0.0.0.0",
    port: PAIR_PORT,
    async fetch(request, srv) {
      const url = new URL(request.url);
      const identity = await loadIdentity(root).catch(() => null);
      if (!hostAllowed(request.headers.get("host") ?? "", identity?.tunnelUrl)) {
        return new Response("Unknown host.", { status: 421 });
      }
      const admin = ["/pair", "/pick-folder", "/replace", "/settings", "/status"].includes(url.pathname);
      if (request.method === "OPTIONS" && admin) return new Response(null, { headers: localCors(request) });
      const local = isLocalAdmin(request, srv.requestIP(request)?.address);
      const mailbox = await handleMailboxRequest(request, url, {
        store,
        uploads,
        token: identity?.pairingToken ?? "",
      });
      if (mailbox) return mailbox;
      if (url.pathname === "/health") return json({ ok: true });
      if (url.pathname === "/pair") {
        if (!identity) return localJson(request, { error: "This Worker is still starting." }, 409);
        if (!local && !redeemPairCode(url.searchParams.get("code") ?? "")) {
          return localJson(request, { error: "Enter the pairing code shown on the Mac." }, 401);
        }
        const tailscale = tailscaleIPv4();
        return localJson(request, {
          workerUrl: pairingUrl(),
          token: identity.pairingToken,
          name: identity.name,
          projectsRoot: identity.projectsRoot,
          lan: pairingUrl(),
          tailscale: tailscale ? pairingUrl(tailscale) : "",
          tunnel: identity.tunnelUrl ?? "",
        });
      }
      if (admin && request.method === "POST" && !local) {
        return localJson(request, { error: "Open Factory on this Mac to change Worker settings." }, 403);
      }
      if (url.pathname === "/pick-folder" && request.method === "POST") {
        try {
          return localJson(request, { path: await pickFolder() });
        } catch (error) {
          return localJson(request, { error: error instanceof Error ? error.message : "Picker failed." }, 400);
        }
      }
      if (url.pathname === "/replace" && request.method === "POST") {
        await replaceIdentity(root);
        return localJson(request, { ok: true });
      }
      if (url.pathname === "/settings" && request.method === "POST") {
        const body: unknown = await request.json().catch(() => null);
        if (!body || typeof body !== "object") return localJson(request, { error: "Invalid body." }, 400);
        const record = body as Record<string, unknown>;
        const patch: { projectsRoot?: string; keepAwake?: boolean; tunnelUrl?: string } = {};
        if (typeof record.projectsRoot === "string" && record.projectsRoot.trim()) {
          patch.projectsRoot = path.resolve(record.projectsRoot.trim());
        }
        if (typeof record.keepAwake === "boolean") patch.keepAwake = record.keepAwake;
        if (typeof record.tunnelUrl === "string") {
          const next = record.tunnelUrl.trim().replace(/\/$/, "");
          if (next && !next.startsWith("https://") && !next.startsWith("http://")) {
            return localJson(request, { error: "Tunnel URL must start with http:// or https://." }, 400);
          }
          patch.tunnelUrl = next;
        }
        try {
          const next = await patchIdentity(root, patch);
          return localJson(request, {
            ok: true,
            projectsRoot: next.projectsRoot,
            keepAwake: next.keepAwake !== false,
            tunnelUrl: next.tunnelUrl ?? "",
          });
        } catch (error) {
          return localJson(request, { error: error instanceof Error ? error.message : "Could not save." }, 400);
        }
      }
      if (url.pathname === "/status") {
        const file = identityPath(root);
        const exists = await Bun.file(file).exists();
        const live = exists ? await loadIdentity(root) : null;
        const tailscale = tailscaleIPv4();
        return localJson(request, {
          paired: exists,
          pairing: pairingUrl(),
          tailscale: tailscale ? pairingUrl(tailscale) : "",
          tunnel: live?.tunnelUrl ?? "",
          projectsRoot: live?.projectsRoot ?? defaultProjectsRoot(),
          keepAwake: live?.keepAwake !== false,
          host: os.hostname(),
          lan: lanIPv4(),
          port: PAIR_PORT,
          ...(local ? { pairCode: currentPairCode() } : {}),
        });
      }
      if (request.method === "GET") return serveWeb(webDir, url.pathname);
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
  currentPairCode();
  return () => server.stop();
}

let caffeinate: ReturnType<typeof spawn> | undefined;

export function setKeepAwake(on: boolean) {
  if (process.platform !== "darwin") return;
  if (!on) {
    caffeinate?.kill();
    caffeinate = undefined;
    return;
  }
  if (caffeinate && caffeinate.exitCode === null) return;
  caffeinate = spawn("caffeinate", ["-i", "-w", String(process.pid)], { stdio: "ignore", detached: true });
  caffeinate.on("error", (error) => console.error("caffeinate failed:", error.message));
  caffeinate.unref();
}
