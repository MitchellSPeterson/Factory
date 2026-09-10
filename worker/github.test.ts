import { afterEach, expect, mock, test } from "bun:test";
import { github } from "../src/github/api";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("credentials go only to the fixed GitHub API origin and cancellation is forwarded", async () => {
  let seen: { url: string; init?: RequestInit } | undefined;
  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => { seen = { url: String(url), init }; return Response.json({ login: "test" }); }) as unknown as typeof fetch;
  const controller = new AbortController();
  expect(await github("test-token", "/user", controller.signal)).toEqual({ login: "test" });
  expect(seen?.url).toBe("https://api.github.com/user");
  expect(seen?.init?.signal).toBe(controller.signal);
  expect((seen?.init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  await expect(github("test-token", "//evil.test")).rejects.toThrow("Invalid GitHub API path");
});
test("permission and expired-token errors are actionable without echoing credentials", async () => {
  for (const [status, message] of [[401, "expired or was revoked"], [403, "denied access"], [404, "not available"], [429, "request limit"]] as const) {
    globalThis.fetch = mock(async () => new Response("secret-token should not appear", { status })) as unknown as typeof fetch;
    await expect(github("secret-token", "/user")).rejects.toThrow(message);
  }
});
test("rate limiting takes precedence over a generic forbidden response", async () => {
  globalThis.fetch = mock(async () => new Response("", { status: 403, headers: { "x-ratelimit-remaining": "0" } })) as unknown as typeof fetch;
  await expect(github("test", "/user")).rejects.toThrow("request limit");
});
