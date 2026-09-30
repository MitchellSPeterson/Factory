import { expect, test } from "bun:test";
import { isolatedArtifactHtml } from "./artifactHtml";

test("artifact CSP precedes untrusted scripts and blocks Worker/network access", () => {
  const script = '<script>fetch("http://localhost:3402/api/query");</script>';
  const html = isolatedArtifactHtml(script);
  expect(html.indexOf("Content-Security-Policy")).toBeLessThan(
    html.indexOf(script),
  );
  expect(html).toContain("connect-src 'none'");
  expect(html).toContain("frame-src 'none'");
  expect(html).toContain("base-uri 'none'");
  expect(html).toContain("form-action 'none'");
  expect(html).toContain('name="referrer" content="no-referrer"');
});

test("self-contained Prototype scripts and visual assets remain available", () => {
  const input =
    '<button onclick="this.textContent=\'Done\'">Try it</button><style>button{color:red}</style><img src="data:image/png;base64,AAAA">';
  const html = isolatedArtifactHtml(input);
  expect(html).toContain(input);
  expect(html).toContain("script-src 'unsafe-inline'");
  expect(html).toContain("style-src 'unsafe-inline'");
  expect(html).toContain("img-src data: blob:");
  expect(html).not.toContain("allow-same-origin");
});
