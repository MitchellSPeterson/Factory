import path from 'node:path';
const root = path.resolve(import.meta.dir, '..');
const result = await Bun.build({
  entrypoints: [path.join(root, 'expo/stream/index.tsx')],
  target: 'browser', minify: true,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
});
if (!result.success) throw new AggregateError(result.logs, 'Could not build device renderer');
const output = result.outputs[0];
if (!output) throw new Error('Device renderer output is missing');
const script = (await output.text()).replaceAll('</script', '<\\/script');
const diagnostics = `function reportStreamError(message){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',message:String(message)}));}window.addEventListener('error',function(event){reportStreamError(event.message||'The stream renderer failed to load.');});window.addEventListener('unhandledrejection',function(event){reportStreamError(event.reason&&event.reason.message||event.reason||'The stream connection failed.');});`;
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff}*{box-sizing:border-box}</style><script>${diagnostics}</script></head><body><div id="root"></div><script>${script}</script></body></html>`;
await Bun.write(path.join(root, 'expo/src/devices/hub/renderer.generated.json'), JSON.stringify(html));
console.log(`Device renderer built (${Math.round(html.length / 1024)} KB).`);
