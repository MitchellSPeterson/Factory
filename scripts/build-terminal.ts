import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const css = (
  await Bun.file(path.join(root, "node_modules/@xterm/xterm/css/xterm.css")).text()
).replaceAll("</", "<\\/");

async function bundle(entry: string) {
  const result = await Bun.build({
    entrypoints: [path.join(root, "expo/terminal", entry)],
    target: "browser",
    minify: true,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
  const output = result.outputs[0];
  if (!result.success || !output)
    throw new AggregateError(result.logs, `Could not build ${entry}`);
  return (await output.text()).replaceAll("</script", "<\\/script");
}

// Terminal page renderer.
const page = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>${css}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101113}body{box-sizing:border-box;padding:12px}.xterm{height:100%}</style></head><body><script>${await bundle("index.ts")}</script></body></html>`;
await Bun.write(
  path.join(root, "expo/src/terminals/renderer.generated.json"),
  JSON.stringify(page),
);

// Chats terminal panel renderer.
const panel = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:#181818;color:#fff}*{box-sizing:border-box}.xterm,.xterm-viewport,.xterm-screen{width:100%!important;height:100%!important}${css}</style></head><body><div id="root"></div><script>${await bundle("panel.ts")}</script></body></html>`;
await Bun.write(
  path.join(root, "expo/src/chats/terminal.generated.json"),
  JSON.stringify(panel),
);
console.log(
  `Terminal renderers built (${Math.round(page.length / 1024)} KB, ${Math.round(panel.length / 1024)} KB).`,
);
