import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";

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
