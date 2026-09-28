import { useMemo } from "react";
import hljs from "highlight.js/lib/common";

import { Card } from "panelui-native/components/card";

// Extension -> highlight.js language id. Anything missing (or not registered
// in the "common" bundle, e.g. dockerfile) falls back to plaintext below.
const EXT_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  md: "markdown",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  swift: "swift",
  kt: "kotlin",
  java: "java",
  sh: "bash",
  zsh: "bash",
  bash: "bash",
  yml: "yaml",
  yaml: "yaml",
  toml: "ini",
  css: "css",
  scss: "scss",
  html: "xml",
  xml: "xml",
  sql: "sql",
  c: "c",
  h: "c",
  cpp: "cpp",
  cs: "csharp",
  php: "php",
  diff: "diff",
  dockerfile: "dockerfile",
};

const MAX_HIGHLIGHT_BYTES = 200_000;
const MAX_HIGHLIGHT_LINES = 5000;

function languageFor(path: string): string | null {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  const key = (dot > 0 ? base.slice(dot + 1) : base).toLowerCase();
  const lang = EXT_LANG[key];
  return lang && hljs.getLanguage(lang) ? lang : null;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

export function CodeView({ path, text }: { path: string; text: string }) {
  const lines = useMemo(() => text.split("\n"), [text]);
  const tooBig = text.length > MAX_HIGHLIGHT_BYTES || lines.length > MAX_HIGHLIGHT_LINES;

  const html = useMemo(() => {
    if (tooBig) return escapeHtml(text);
    const lang = languageFor(path);
    if (!lang) return escapeHtml(text);
    try {
      return hljs.highlight(text, { language: lang, ignoreIllegals: true }).value;
    } catch {
      return escapeHtml(text);
    }
  }, [text, path, tooBig]);

  const gutterDigits = String(lines.length).length;

  return (
    <Card className="min-h-0 flex-1 flex-col overflow-hidden rounded-none border-0 bg-surface shadow-none">
      <style>{`
        .fx-code-line .hljs-comment, .fx-code-line .hljs-quote { color: var(--color-code-comment); font-style: italic; }
        .fx-code-line .hljs-keyword, .fx-code-line .hljs-selector-tag, .fx-code-line .hljs-tag,
        .fx-code-line .hljs-regexp { color: var(--color-code-keyword); }
        .fx-code-line .hljs-deletion { color: var(--color-code-deleted); }
        .fx-code-line .hljs-string, .fx-code-line .hljs-addition, .fx-code-line .hljs-meta-string { color: var(--color-code-string); }
        .fx-code-line .hljs-title, .fx-code-line .hljs-section, .fx-code-line .hljs-name,
        .fx-code-line .hljs-selector-id, .fx-code-line .hljs-selector-class, .fx-code-line .hljs-built_in { color: var(--color-code-function); }
        .fx-code-line .hljs-number, .fx-code-line .hljs-literal, .fx-code-line .hljs-symbol,
        .fx-code-line .hljs-bullet { color: var(--color-code-number); }
        .fx-code-line .hljs-type, .fx-code-line .hljs-attr, .fx-code-line .hljs-attribute,
        .fx-code-line .hljs-params, .fx-code-line .hljs-template-variable,
        .fx-code-line .hljs-variable.language_ { color: var(--color-code-property); }
        .fx-code-line .hljs-meta, .fx-code-line .hljs-doctag, .fx-code-line .hljs-link { color: var(--color-muted-foreground); }
        .fx-code-line .hljs-emphasis { font-style: italic; }
        .fx-code-line .hljs-strong { font-weight: 600; }
      `}</style>
      {/* One scroller for both axes; the gutter is sticky so it stays put sideways and scrolls with the lines. */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", width: "max-content", minWidth: "100%" }}>
        <div
          style={{
            position: "sticky",
            left: 0,
            zIndex: 1,
            alignSelf: "stretch",
            flexShrink: 0,
            userSelect: "none",
            textAlign: "right",
            color: "var(--color-muted-foreground)",
            backgroundColor: "var(--color-surface)",
            borderRight: "1px solid var(--color-border)",
            padding: "8px 10px",
            minWidth: `${gutterDigits + 2}ch`,
            fontFamily: "var(--font-mono)",
            fontSize: 12.5,
            lineHeight: "20px",
            whiteSpace: "pre",
          }}>
          {lines.map((_, i) => i + 1).join("\n")}
        </div>
        <pre style={{ margin: 0, flex: "1 0 auto", padding: "8px 12px" }}>
          <code
            className="fx-code-line"
            style={{
              color: "var(--color-foreground)",
              fontFamily: "var(--font-mono)",
              fontSize: 12.5,
              lineHeight: "20px",
              tabSize: 2,
              whiteSpace: "pre",
              display: "block",
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </pre>
        </div>
      </div>
    </Card>
  );
}
