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

const PAIR_PORT = Number(process.env.FACTORY_PAIR_PORT || 3402);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*" },
  });
}

async function pickFolder(): Promise<string> {
  if (process.platform !== "darwin") throw new Error("Folder picker is only on the Mac Worker.");
  const script =
    'POSIX path of (choose folder with prompt "Choose a Project checkout")';
  const proc = Bun.spawn(["osascript", "-e", script], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(err.trim() || "Folder picker cancelled.");
  return out.trim().replace(/\/$/, "");
}

async function deployConvex(root: string, deployKey: string) {
  const proc = Bun.spawn(["bunx", "convex", "deploy", "--yes"], {
    cwd: root,
    env: { ...process.env, CONVEX_DEPLOY_KEY: deployKey },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error((err || out).trim().slice(0, 400) || "Convex deploy failed.");
  return (out + "\n" + err).trim();
}

export function pairingPort() {
  return PAIR_PORT;
}

export function pairingUrl() {
  return `http://${lanIPv4() || "127.0.0.1"}:${PAIR_PORT}`;
}

function lanIPv4() {
  for (const rows of Object.values(os.networkInterfaces())) {
    for (const row of rows ?? []) {
      if (row.internal || row.family !== "IPv4") continue;
      return row.address;
    }
  }
  return "";
}

export async function startPairingHub(root: string) {
  const server = Bun.serve({
    hostname: "0.0.0.0",
    port: PAIR_PORT,
    async fetch(request) {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET,POST,OPTIONS",
            "access-control-allow-headers": "content-type",
          },
        });
      }
      if (url.pathname === "/health") return json({ ok: true });
      if (url.pathname === "/pair") {
        try {
          const identity = await loadIdentity(root);
          return json({
            convexUrl: identity.convexUrl,
            name: identity.name,
            projectsRoot: identity.projectsRoot,
          });
        } catch {
          return json({ error: "This Worker has no Convex URL yet. Finish Settings on the Mac." }, 409);
        }
      }
      if (url.pathname === "/pick-folder" && request.method === "POST") {
        try {
          return json({ path: await pickFolder() });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Picker failed." }, 400);
        }
      }
      if (url.pathname === "/setup" && request.method === "POST") {
        const body: unknown = await request.json().catch(() => null);
        if (!body || typeof body !== "object") return json({ error: "Invalid body." }, 400);
        const record = body as Record<string, unknown>;
        const convexUrl = typeof record.convexUrl === "string" ? record.convexUrl.trim() : "";
        const deployKey = typeof record.deployKey === "string" ? record.deployKey.trim() : "";
        if (!convexUrl.startsWith("https://") || !convexUrl.includes("convex.cloud")) {
          return json({ error: "Paste a Convex URL like https://happy-animal-123.convex.cloud" }, 400);
        }
        if (deployKey) {
          try {
            await deployConvex(root, deployKey);
          } catch (error) {
            return json({ error: error instanceof Error ? error.message : "Deploy failed." }, 400);
          }
        }
        try {
          await loadIdentity(root, convexUrl);
          return json({ ok: true, convexUrl });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Could not save Convex URL." }, 400);
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
        const patch: { projectsRoot?: string; keepAwake?: boolean } = {};
        if (typeof record.projectsRoot === "string" && record.projectsRoot.trim()) {
          patch.projectsRoot = path.resolve(record.projectsRoot.trim());
        }
        if (typeof record.keepAwake === "boolean") patch.keepAwake = record.keepAwake;
        try {
          const next = await patchIdentity(root, patch);
          return json({ ok: true, projectsRoot: next.projectsRoot, keepAwake: next.keepAwake !== false });
        } catch (error) {
          return json({ error: error instanceof Error ? error.message : "Could not save." }, 400);
        }
      }
      if (url.pathname === "/status") {
        const file = identityPath(root);
        const exists = await Bun.file(file).exists();
        return json({
          paired: exists,
          pairing: pairingUrl(),
          projectsRoot: exists ? (await loadIdentity(root)).projectsRoot : defaultProjectsRoot(),
          keepAwake: exists ? (await loadIdentity(root)).keepAwake !== false : true,
          host: os.hostname(),
          lan: lanIPv4(),
          port: PAIR_PORT,
        });
      }
      return json({ error: "Not found." }, 404);
    },
  });
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
