import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { handleMailboxRequest } from "./mailbox/http";
import { openStore, type Store } from "./mailbox/store";

const fixtures: { dir: string; store: Store }[] = [];
afterEach(() => {
  for (const { dir, store } of fixtures.splice(0)) {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixture(mime = "text/html") {
  const dir = mkdtempSync(path.join(os.tmpdir(), "factory-build-artifacts-"));
  const store = openStore(path.join(dir, "mailbox.sqlite"));
  fixtures.push({ dir, store });
  const uploads = path.join(dir, "uploads");
  const buildId = store.insert("builds", { workflow: { artifacts: [] } });
  const folder = path.join(uploads, "build-artifacts", buildId);
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, "prototype.html");
  writeFileSync(file, "<button>Preview</button>");
  const artifact = { id: "revision_1", path: file, mime, title: "Prototype 1" };
  store.patch(buildId, { workflow: { artifacts: [artifact] } });
  const input = { store, uploads, token: "paired-token" };
  async function request(id = artifact.id, token = input.token, query = "") {
    const url = new URL(`http://localhost/mailbox/build-artifacts/${buildId}/${encodeURIComponent(id)}${query}`);
    return (await handleMailboxRequest(new Request(url, { headers: { authorization: `Bearer ${token}` } }), url, input))!;
  }
  return { dir, store, folder, file, artifact, buildId, input, request };
}

test("Build artifacts require pairing and return HTML as data, not executable origin content", async () => {
  const f = fixture();
  expect((await f.request(f.artifact.id, "wrong-token")).status).toBe(401);
  const response = await f.request();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/json");
  expect(await response.json()).toEqual({ content: "<button>Preview</button>", mime: "text/html", title: "Prototype 1" });
  const raw = await f.request(f.artifact.id, f.input.token, "?format=raw");
  expect(raw.headers.get("content-disposition")).toBe("attachment");
  expect(raw.headers.get("content-security-policy")).toContain("sandbox");
});

test("only registered artifacts within their own Build directory are served", async () => {
  const f = fixture();
  expect((await f.request("missing")).status).toBe(404);
  expect((await f.request("../prototype.html")).status).toBe(404);
  const secret = path.join(f.dir, "outside.txt");
  writeFileSync(secret, "not an artifact");
  symlinkSync(secret, path.join(f.folder, "escape.txt"));
  f.store.patch(f.buildId, { workflow: { artifacts: [{ ...f.artifact, path: path.join(f.folder, "escape.txt") }] } });
  expect((await f.request()).status).toBe(404);
  f.store.patch(f.buildId, { workflow: { artifacts: [{ ...f.artifact, path: secret }] } });
  expect((await f.request()).status).toBe(404);
});

test("passive images can be fetched as authenticated bytes", async () => {
  const f = fixture("image/png");
  writeFileSync(f.file, new Uint8Array([137, 80, 78, 71]));
  expect(await (await f.request()).json()).toEqual({ content: "", mime: "image/png", title: "Prototype 1" });
  const response = await f.request(f.artifact.id, f.input.token, "?format=raw");
  expect(response.headers.get("content-type")).toBe("image/png");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
});
