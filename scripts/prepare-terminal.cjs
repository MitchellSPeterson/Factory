const fs = require("node:fs");
const path = require("node:path");
// node-pty 1.1.0 ships its macOS prebuilt helper without the executable bit.
if (process.platform === "darwin") {
  const root = path.dirname(require.resolve("node-pty/package.json"));
  for (const directory of [
    "build/Release",
    `prebuilds/darwin-${process.arch}`,
  ]) {
    const helper = path.join(root, directory, "spawn-helper");
    if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755);
  }
}
