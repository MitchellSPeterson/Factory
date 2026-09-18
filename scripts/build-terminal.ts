import path from "node:path";
<<<<<<< HEAD
const root = path.resolve(import.meta.dir, "..");
=======

const root = path.resolve(import.meta.dir, "..");
const cssPath = path.join(root, "node_modules/@xterm/xterm/css/xterm.css");
const css = (await Bun.file(cssPath).text()).replaceAll("</", "<\\/");
>>>>>>> 7ab3869e5c6910ec4f56fd7f967f3c674180989a
const result = await Bun.build({
  entrypoints: [path.join(root, "expo/terminal/index.ts")],
  target: "browser",
  minify: true,
<<<<<<< HEAD
});
if (!result.success || !result.outputs[0])
  throw new AggregateError(result.logs, "Could not build terminal renderer");
const script = (await result.outputs[0].text()).replaceAll(
  "</script",
  "<\\/script",
);
const css = await Bun.file(
  path.join(root, "expo/node_modules/@xterm/xterm/css/xterm.css"),
).text();
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><style>${css}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101113}body{box-sizing:border-box;padding:12px}.xterm{height:100%}</style></head><body><script>${script}</script></body></html>`;
await Bun.write(
  path.join(root, "expo/src/terminals/renderer.generated.json"),
=======
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!result.success) throw new AggregateError(result.logs, "Could not build terminal renderer");
const output = result.outputs[0];
if (!output) throw new Error("Terminal renderer output is missing");
const script = (await output.text()).replaceAll("</script", "<\\/script");
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:#181818;color:#fff}*{box-sizing:border-box}.xterm,.xterm-viewport,.xterm-screen{width:100%!important;height:100%!important}${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`;
await Bun.write(
  path.join(root, "expo/src/chats/terminal.generated.json"),
>>>>>>> 7ab3869e5c6910ec4f56fd7f967f3c674180989a
  JSON.stringify(html),
);
console.log(`Terminal renderer built (${Math.round(html.length / 1024)} KB).`);
