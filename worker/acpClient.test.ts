import { expect, test } from "bun:test";
import { encodeAcpMessage, parseAcpLine } from "./acpClient";

test("ACP lines distinguish requests, responses, and notifications", () => {
  expect(parseAcpLine('{"jsonrpc":"2.0","id":1,"result":{"sessionId":"abc"}}')).toEqual({
    kind: "response",
    id: 1,
    result: { sessionId: "abc" },
  });
  expect(parseAcpLine('{"jsonrpc":"2.0","id":2,"error":{"code":-32601,"message":"missing"}}')).toEqual({
    kind: "error",
    id: 2,
    error: { code: -32601, message: "missing" },
  });
  expect(parseAcpLine('{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s"}}')).toEqual({
    kind: "notification",
    method: "session/update",
    params: { sessionId: "s" },
  });
  expect(parseAcpLine('{"jsonrpc":"2.0","id":"perm-1","method":"session/request_permission","params":{}}')).toEqual({
    kind: "request",
    id: "perm-1",
    method: "session/request_permission",
    params: {},
  });
  expect(parseAcpLine("not json")).toBeNull();
});

test("ACP writes are newline-delimited JSON-RPC", () => {
  expect(encodeAcpMessage({ id: 1, method: "initialize" })).toBe(
    '{"jsonrpc":"2.0","id":1,"method":"initialize"}\n',
  );
});

test("ACP pending requests reject when the stdout reader fails", async () => {
  const { createAcpClient } = await import("./acpClient");
  const stdout = new ReadableStream<Uint8Array>({ pull: (c) => c.error(new Error("boom")) });
  const client = createAcpClient({
    stdin: { write: () => {}, end: () => {} },
    stdout,
    stderr: new ReadableStream({ start: (c) => c.close() }),
    exited: new Promise<number>(() => {}),
    kill: () => {},
  }, { onRequest: async () => null, onNotification: () => {} });
  await expect(client.request("x")).rejects.toThrow("boom");
});
