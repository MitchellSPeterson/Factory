import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const cssPath = path.join(root, "node_modules/@xterm/xterm/css/xterm.css");
const css = (await Bun.file(cssPath).text()).replaceAll("</", "<\\/");
const result = await Bun.build({
  entrypoints: [path.join(root, "expo/terminal/index.ts")],
  target: "browser",
  minify: true,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!result.success) throw new AggregateError(result.logs, "Could not build terminal renderer");
const output = result.outputs[0];
if (!output) throw new Error("Terminal renderer output is missing");
const script = (await output.text()).replaceAll("</script", "<\\/script");
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:#181818;color:#fff}*{box-sizing:border-box}.xterm,.xterm-viewport,.xterm-screen{width:100%!important;height:100%!important}${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`;
await Bun.write(
  path.join(root, "expo/src/chats/terminal.generated.json"),
  JSON.stringify(html),
);
console.log(`Terminal renderer built (${Math.round(html.length / 1024)} KB).`);
