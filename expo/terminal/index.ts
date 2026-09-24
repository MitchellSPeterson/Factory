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

// xterm 6 scrolls on wheel only, so drive touch drags ourselves.
const element = terminal.element!;
let touchY: number | null = null;
let carry = 0;
element.addEventListener(
  "touchstart",
  (event) => {
    touchY = event.touches.length === 1 ? event.touches[0].clientY : null;
    carry = 0;
  },
  { passive: true },
);
element.addEventListener(
  "touchmove",
  (event) => {
    if (touchY === null || event.touches.length !== 1) return;
    const y = event.touches[0].clientY;
    carry += touchY - y;
    touchY = y;
    const line = element.clientHeight / terminal.rows || 17;
    const lines = Math.trunc(carry / line);
    if (!lines) return;
    carry -= lines * line;
    event.preventDefault();
    // Full-screen apps (less, vim) have no scrollback; send arrows like Terminal.app.
    if (terminal.buffer.active.type === "alternate") {
      if (enabled)
        post({ type: "input", data: (lines > 0 ? "\u001b[B" : "\u001b[A").repeat(Math.abs(lines)) });
    } else terminal.scrollLines(lines);
  },
  { passive: false },
);
element.addEventListener("touchend", () => (touchY = null));

const latest = document.createElement("button");
latest.textContent = "↓ Latest";
latest.setAttribute("aria-label", "Jump to latest output");
latest.style.cssText =
  "position:fixed;right:16px;bottom:16px;z-index:10;display:none;padding:8px 14px;border:0;border-radius:999px;background:#8b7cf6;color:#fff;font:600 13px -apple-system,system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4)";
latest.addEventListener("click", () => {
  terminal.scrollToBottom();
  terminal.focus();
});
document.body.appendChild(latest);
function showLatest() {
  const buffer = terminal.buffer.active;
  latest.style.display = buffer.viewportY < buffer.baseY ? "block" : "none";
}
terminal.onScroll(showLatest);
terminal.onWriteParsed(showLatest);
post({ type: "ready" });
