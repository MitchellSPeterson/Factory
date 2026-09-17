import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

function post(value: unknown) {
  const data = JSON.stringify(value);
  const bridge: unknown = Reflect.get(window, "ReactNativeWebView");
  if (bridge !== null && typeof bridge === "object") {
    const postMessage: unknown = Reflect.get(bridge, "postMessage");
    if (typeof postMessage === "function") {
      Reflect.apply(postMessage, bridge, [data]);
      return;
    }
  }
  window.parent.postMessage(data, "*");
}

const root = document.getElementById("root");
if (!root) throw new Error("terminal root is missing");

const term = new Terminal({
  convertEol: true,
  cursorBlink: true,
  fontSize: 13,
  fontFamily: "ui-monospace, Menlo, monospace",
  theme: { background: "#181818", foreground: "#ffffff", cursor: "#ffffff" },
  scrollback: 4000,
});
const fit = new FitAddon();
term.loadAddon(fit);
term.open(root);
term.onData((data) => post({ type: "input", data }));
term.onResize(({ cols, rows }) => post({ type: "resize", cols, rows }));

function apply(raw: unknown) {
  const text = typeof raw === "string" ? raw : null;
  if (!text) return;
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }
  if (!message || typeof message !== "object") return;
  const type = (message as { type?: unknown }).type;
  if (type === "write" && typeof (message as { data?: unknown }).data === "string") {
    term.write((message as { data: string }).data);
  } else if (type === "clear") {
    term.reset();
  } else if (type === "fit") {
    fit.fit();
  }
}

window.addEventListener("message", (event) => apply(event.data));
document.addEventListener("message", (event) => apply((event as MessageEvent).data));
new ResizeObserver(() => fit.fit()).observe(document.documentElement);
queueMicrotask(() => {
  fit.fit();
  term.focus();
  post({ type: "ready", cols: term.cols, rows: term.rows });
});
