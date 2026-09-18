import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

<<<<<<< HEAD
declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (data: string) => void };
    factoryTerminal?: (value: unknown) => void;
  }
}
const terminal = new Terminal({
  cursorBlink: true,
  screenReaderMode: true,
  fontSize: 13,
  fontFamily: "Menlo, Monaco, monospace",
  scrollback: 5000,
  theme: {
    background: "#101113",
    foreground: "#e7e7e9",
    cursor: "#e7e7e9",
    selectionBackground: "#454851",
  },
});
const fit = new FitAddon();
terminal.loadAddon(fit);
terminal.open(document.body);
let end = 0;
let enabled = false;
function post(value: object) {
  const data = JSON.stringify(value);
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(data);
  else window.parent.postMessage(data, "*");
}
window.factoryTerminal = (value: unknown) => {
  if (!value || typeof value !== "object") return;
  if (
    "output" in value &&
    typeof value.output === "string" &&
    "outputEnd" in value &&
    typeof value.outputEnd === "number" &&
    value.outputEnd > end
  ) {
    const start = value.outputEnd - value.output.length;
    if (end < start) {
      terminal.reset();
      end = start;
    }
    terminal.write(value.output.slice(end - start));
    end = value.outputEnd;
  }
  if ("enabled" in value && typeof value.enabled === "boolean") {
    enabled = value.enabled;
    terminal.options.disableStdin = !enabled;
  }
  if ("focus" in value && value.focus === true) terminal.focus();
};
window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  try {
    window.factoryTerminal?.(JSON.parse(event.data));
  } catch {
    /* Ignore unrelated messages. */
  }
});
terminal.onData((data) => {
  if (enabled) post({ type: "input", data });
});
terminal.onResize(({ cols, rows }) => post({ type: "resize", cols, rows }));
const observer = new ResizeObserver(() => {
  if (document.body.clientWidth > 0 && document.body.clientHeight > 0)
    fit.fit();
});
observer.observe(document.body);
fit.fit();
post({ type: "ready" });
=======
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
>>>>>>> 7ab3869e5c6910ec4f56fd7f967f3c674180989a
