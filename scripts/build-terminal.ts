import path from "node:path";
const root = path.resolve(import.meta.dir, "..");
const result = await Bun.build({
  entrypoints: [path.join(root, "expo/terminal/index.ts")],
  target: "browser",
  minify: true,
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
  JSON.stringify(html),
);
console.log(`Terminal renderer built (${Math.round(html.length / 1024)} KB).`);
