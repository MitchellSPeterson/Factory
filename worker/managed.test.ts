import { afterEach, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { cloneRepository, loadIdentity, type GitRunner } from "./managed";
import { openSecret, sealSecret } from "../shared/secrets";
import { validateVariableName } from "../shared/managed";
const temporary: string[] = [];
afterEach(async () => { for (const dir of temporary.splice(0)) await fs.rm(dir, { recursive: true, force: true }); });
async function root() { const dir = await fs.mkdtemp(path.join(os.tmpdir(), "factory-test-")); temporary.push(dir); return dir; }
async function git(args: string[]) {
  const proc = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code) throw new Error(stderr);
  return stdout.trim();
}
test("worker identity survives restart, is private, and rejects a different deployment", async () => {
  const dir = await root();
  const identity = await loadIdentity(dir, "https://test.convex.cloud");
  expect(await loadIdentity(dir)).toEqual(identity);
  expect((await fs.stat(path.join(dir, ".factory/worker.json"))).mode & 0o777).toBe(0o600);
  await expect(loadIdentity(dir, "https://different.convex.cloud")).rejects.toThrow("another Convex");
});
test("multiline values encrypt for only their destination worker and tampering fails", async () => {
  const identity = await loadIdentity(await root(), "https://test.convex.cloud");
  const other = await loadIdentity(await root(), "https://test.convex.cloud");
  const value = "private\nmultiline\n" + "x".repeat(8000);
  const cipher = await sealSecret(identity.publicKey, value);
  expect(cipher).not.toContain("private");
  expect(await openSecret(identity.privateKey, cipher)).toBe(value);
  await expect(openSecret(other.privateKey, cipher)).rejects.toThrow();
  const data = JSON.parse(cipher); data.body = "A" + data.body.slice(1);
  if (JSON.stringify(data) !== cipher) await expect(openSecret(identity.privateKey, JSON.stringify(data))).rejects.toThrow();
});
test("cloning materializes a real Git checkout, keeps credentials out of origin, and retries without overwriting", async () => {
  const dir = await root(); const source = path.join(dir, "source"); await fs.mkdir(source);
  await git(["init", "--initial-branch=trunk", source]);
  await fs.writeFile(path.join(source, "README.md"), "fixture");
  await git(["-C", source, "add", "."]);
  await git(["-C", source, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "fixture"]);
  const runner: GitRunner = async (args, env) => {
    expect(args.join(" ")).not.toContain("test-credential");
    if (args.includes("clone")) {
      expect(env.FACTORY_CLONE_TOKEN).toBe("test-credential");
      const target = args.at(-1)!;
      await git(["clone", "--", source, target]);
      await git(["-C", target, "remote", "set-url", "origin", "https://github.com/owner/repo.git"]);
      return "";
    }
    return git(args);
  };
  const projects = path.join(dir, "projects");
  const dest = await cloneRepository(projects, "project1", "owner/repo", "test-credential", runner);
  expect(await fs.readFile(path.join(dest, "README.md"), "utf8")).toBe("fixture");
  expect(await git(["-C", dest, "branch", "--show-current"])).toBe("trunk");
  expect(await fs.readdir(projects)).toEqual(["project1"]);
  await fs.writeFile(path.join(dest, "README.md"), "user edit");
  expect(await cloneRepository(projects, "project1", "owner/repo", "test-credential", runner)).toBe(dest);
  expect(await fs.readFile(path.join(dest, "README.md"), "utf8")).toBe("user edit");
  await expect(cloneRepository(projects, "project1", "owner/other", "test-credential", runner)).rejects.toThrow("another repository");
});
test("failed clones clean only their temporary directory and reject symlink destinations", async () => {
  const dir = await root(); const projects = path.join(dir, "projects");
  await expect(cloneRepository(projects, "project", "owner/repo", "secret", async () => { throw new Error("failed"); })).rejects.toThrow();
  expect(await fs.readdir(projects)).toEqual([]);
  await fs.symlink(dir, path.join(projects, "project"));
  await expect(cloneRepository(projects, "project", "owner/repo", "secret")).rejects.toThrow("occupied");
  await expect(cloneRepository(projects, "../escape", "owner/repo", "secret")).rejects.toThrow("identifier");
});
test("Project values cannot replace worker bootstrapping or shell startup configuration", () => {
  for (const name of ["BASH_ENV", "NODE_OPTIONS", "GIT_ASKPASS", "HOME", "CONVEX_URL", "FACTORY_PROVIDER", "CODEX_HOME", "CODEX_PATH", "CODEX_API_KEY"]) expect(() => validateVariableName(name, false)).toThrow();
  expect(() => validateVariableName("DATABASE_URL", false)).not.toThrow();
  expect(() => validateVariableName("OPENAI_API_KEY", true)).not.toThrow();
  expect(() => validateVariableName("CODEX_API_KEY", true)).not.toThrow();
});
