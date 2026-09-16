import { expect, test } from "bun:test";
import { configUrlForStream, encodeButton, encodeTouch, pointOnRect } from "./touch";

test("encodeTouch writes serve-sim JSON HID packets", () => {
  const bytes = encodeTouch({ type: "begin", x: 0.5, y: 1 });
  expect(bytes[0]).toBe(3);
  expect(JSON.parse(new TextDecoder().decode(bytes.slice(1)))).toEqual({ type: "begin", x: 0.5, y: 1 });
});

test("encodeButton writes a home press", () => {
  const bytes = encodeButton("home");
  expect(bytes[0]).toBe(4);
  expect(JSON.parse(new TextDecoder().decode(bytes.slice(1)))).toEqual({ button: "home" });
});

test("pointOnRect maps clicks onto the hit target", () => {
  const rect = { left: 10, top: 20, width: 200, height: 400 };
  expect(pointOnRect({ clientX: 110, clientY: 220, rect })).toEqual({ x: 0.5, y: 0.5 });
  expect(pointOnRect({ clientX: 0, clientY: 0, rect })).toBeNull();
});

test("configUrlForStream swaps the MJPEG path", () => {
  expect(configUrlForStream("http://127.0.0.1:3100/helper/AAA/stream.mjpeg")).toBe("http://127.0.0.1:3100/helper/AAA/config");
  expect(configUrlForStream("http://127.0.0.1:3100/health")).toBeNull();
});
