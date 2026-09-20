import { expect, test } from "bun:test";
import { localWorkerBase, pairingBase, pairingFromLocalPair } from "./pairingBase";

test("pairingBase adds the Worker pair port to a bare IP", () => {
  expect(pairingBase("192.168.1.20")).toBe("http://192.168.1.20:3402");
  expect(pairingBase("http://192.168.1.20:3402/")).toBe("http://192.168.1.20:3402");
  expect(pairingBase("10.0.0.4:9000")).toBe("http://10.0.0.4:9000");
});

test("web uses this page's loopback host and the Worker token", () => {
  expect(localWorkerBase("localhost")).toBe("http://localhost:3402");
  expect(localWorkerBase("127.0.0.1")).toBe("http://127.0.0.1:3402");
  expect(localWorkerBase("factory.example")).toBe("http://127.0.0.1:3402");
  expect(pairingFromLocalPair({ token: "abc", tunnel: "https://factory.example" }, "http://localhost:3402")).toEqual({
    url: "http://localhost:3402",
    token: "abc",
  });
  expect(pairingFromLocalPair({ convexUrl: "https://old.convex.cloud" }, "http://localhost:3402")).toBeNull();
});
