import { expect, test } from "bun:test";
import { currentPairCode, hostAllowed, isLocalAdmin, redeemPairCode } from "./pairing";

const req = (headers: Record<string, string>) => new Request("http://127.0.0.1:3402/settings", { headers });

test("hostAllowed rejects DNS-rebinding hosts", () => {
  expect(hostAllowed("127.0.0.1:3402")).toBe(true);
  expect(hostAllowed("localhost:3402")).toBe(true);
  expect(hostAllowed("192.168.1.20:3402")).toBe(true);
  expect(hostAllowed("mac.tail1234.ts.net")).toBe(true);
  expect(hostAllowed("factory.example.com", "https://factory.example.com")).toBe(true);
  expect(hostAllowed("evil.com:3402")).toBe(false);
  expect(hostAllowed("")).toBe(false);
});

test("isLocalAdmin needs loopback socket, loopback host, and local origin", () => {
  expect(isLocalAdmin(req({ host: "127.0.0.1:3402" }), "127.0.0.1")).toBe(true);
  expect(isLocalAdmin(req({ host: "127.0.0.1:3402", origin: "http://localhost:8081" }), "::1")).toBe(true);
  expect(isLocalAdmin(req({ host: "127.0.0.1:3402" }), "192.168.1.9")).toBe(false);
  expect(isLocalAdmin(req({ host: "factory.example.com" }), "127.0.0.1")).toBe(false);
  expect(isLocalAdmin(req({ host: "127.0.0.1:3402", origin: "https://evil.com" }), "127.0.0.1")).toBe(false);
});

test("pair codes are single-use and rotate after repeated failures", () => {
  const code = currentPairCode();
  expect(redeemPairCode(code)).toBe(true);
  expect(redeemPairCode(code)).toBe(false);
  const next = currentPairCode();
  for (let i = 0; i < 5; i++) redeemPairCode("x");
  expect(currentPairCode()).not.toBe(next);
});
