import { expect, test } from "bun:test";
import { pairingBase } from "./pairingBase";

test("pairingBase adds the Worker pair port to a bare IP", () => {
  expect(pairingBase("192.168.1.20")).toBe("http://192.168.1.20:3402");
  expect(pairingBase("http://192.168.1.20:3402/")).toBe("http://192.168.1.20:3402");
  expect(pairingBase("10.0.0.4:9000")).toBe("http://10.0.0.4:9000");
});
