import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomBytes } from "node:crypto";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { openSecret } from "../shared/secrets";
import { validateRepository, validateVariableName } from "../shared/managed";

export type WorkerIdentity = { accessKey: string; publicKey: string; privateKey: JsonWebKey; convexUrl: string; projectsRoot: string; name: string };
export async function loadIdentity(root: string, convexUrl?: string): Promise<WorkerIdentity> {
  const dir = path.join(root, ".factory");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(dir, "worker.json");
  try {
    const saved = JSON.parse(await fs.readFile(file, "utf8")) as WorkerIdentity;
    if (convexUrl && saved.convexUrl !== convexUrl) throw new Error("Worker belongs to another Convex deployment. Use a separate Factory checkout.");
    return saved;
  } catch (err) { if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err; }
  if (!convexUrl) throw new Error("Start once with CONVEX_URL or --url https://your-deployment.convex.cloud.");
  const keys = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["encrypt", "decrypt"]);
  const identity: WorkerIdentity = { accessKey: randomBytes(32).toString("hex"), publicKey: JSON.stringify(await crypto.subtle.exportKey("jwk", keys.publicKey)), privateKey: await crypto.subtle.exportKey("jwk", keys.privateKey), convexUrl, name: os.hostname(), projectsRoot: path.join(dir, "projects") };
  await fs.writeFile(file, JSON.stringify(identity), { mode: 0o600, flag: "wx" });
  return identity;
}
export type GitRunner = (args: string[], env: Record<string, string>) => Promise<string>;
export const runGit: GitRunner = async (args, env) => {
  const proc = Bun.spawn(["git", ...args], { env, stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => proc.kill("SIGKILL"), 10 * 60_000);
  try {
    const [out, , code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    if (code !== 0) throw new Error("Clone failed. Check GitHub Contents read permission, token expiry, network access, and free disk space, then retry.");
    return out.trim();
  } finally { clearTimeout(timer); }
};
export async function cloneRepository(projectsRoot: string, projectId: string, repo: string, token: string, run: GitRunner = runGit) {
  validateRepository(repo);
  if (!/^[a-zA-Z0-9_-]+$/.test(projectId)) throw new Error("Invalid Project identifier.");
  await fs.mkdir(projectsRoot, { recursive: true, mode: 0o700 });
  const root = await fs.realpath(projectsRoot);
  const destination = path.join(root, projectId);
  const url = `https://github.com/${repo}.git`;
  const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: os.homedir(), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
  try {
    const stat = await fs.lstat(destination);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("The clone destination is already occupied.");
    const origin = await run(["-C", destination, "remote", "get-url", "origin"], env);
    if (origin !== url) throw new Error("The clone destination contains another repository. No files were changed.");
    return destination; // Recover after a successful clone whose completion callback was interrupted.
  } catch (err) { if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err; }
  const temporary = await fs.mkdtemp(path.join(root, ".import-"));
  const askpass = path.join(temporary, "askpass");
  await fs.writeFile(askpass, '#!/bin/sh\ncase "$1" in\n  *Username*) printf "%s" "x-access-token" ;;\n  *) printf "%s" "$FACTORY_CLONE_TOKEN" ;;\nesac\n', { mode: 0o700 });
  try {
    await run(["-c", "credential.helper=", "-c", "core.hooksPath=/dev/null", "-c", "protocol.file.allow=never", "-c", "http.followRedirects=false", "clone", "--", url, path.join(temporary, "checkout")], { ...env, GIT_ASKPASS: askpass, FACTORY_CLONE_TOKEN: token });
    await fs.rename(path.join(temporary, "checkout"), destination);
    return destination;
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}
export async function importTick(client: ConvexHttpClient, identity: WorkerIdentity) {
  const task = await client.mutation(api.servers.claimImport, { accessKey: identity.accessKey });
  if (!task) return;
  let localPath: string | undefined;
  let error: string | undefined;
  try {
    if (!task.sealedToken) throw new Error("GitHub credentials expired. Reconnect GitHub and retry.");
    const token = await openSecret(identity.privateKey, task.sealedToken);
    localPath = await cloneRepository(identity.projectsRoot, task.projectId, task.repo, token);
  } catch { error = "Clone failed. Check Contents read permission, token expiry, network and disk space, then retry. Existing files were preserved."; }
  await client.mutation(api.servers.finishImport, { accessKey: identity.accessKey, importId: task._id, attempt: task.attempt, localPath, error });
}
export async function environmentFor(client: ConvexHttpClient, identity: WorkerIdentity, projectId?: Id<"projects">) {
  const rows = await client.query(api.servers.readEnvironment, { accessKey: identity.accessKey, projectId });
  const server: Record<string, string> = {};
  const project: Record<string, string> = {};
  for (const row of rows) {
    validateVariableName(row.name, row.scope === "server");
    const value = await openSecret(identity.privateKey, row.sealed);
    if (value.includes("\0")) throw new Error("An environment variable contains an invalid NUL character.");
    (row.scope === "server" ? server : project)[row.name] = value;
  }
  if (server.FACTORY_PROVIDER && !["openai", "cursor", "codex"].includes(server.FACTORY_PROVIDER)) throw new Error("FACTORY_PROVIDER must be openai, cursor, or codex.");
  return { server, project };
}
