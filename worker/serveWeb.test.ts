import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { serveWeb } from "./pairing";

test("serveWeb serves assets, falls back to index.html, and stays inside dist", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "factory-web-"));
  writeFileSync(path.join(dir, "index.html"), "<app>");
  writeFileSync(path.join(dir, "app.js"), "js");
  expect(await (await serveWeb(dir, "/app.js")).text()).toBe("js");
  expect(await (await serveWeb(dir, "/settings/providers/codex")).text()).toBe("<app>");
  expect(await (await serveWeb(dir, "/")).text()).toBe("<app>");
  expect((await serveWeb(dir, "/missing.js")).status).toBe(404);
  expect((await serveWeb(dir, "/..%2f..%2fetc%2fpasswd")).status).toBe(404);
  expect((await serveWeb(dir, "/%E0%A4%A")).status).toBe(404);
});
