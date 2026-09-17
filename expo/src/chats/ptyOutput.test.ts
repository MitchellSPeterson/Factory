import { expect, test } from "bun:test";
import { createPtyDisplayGate } from "./ptyOutput";

test("queues writes until the renderer is ready, then delivers in order", () => {
  const gate = createPtyDisplayGate();
  const seen: string[] = [];
  const deliver = (event: { kind: string; data?: string }) => {
    seen.push(event.kind === "clear" ? "clear" : `write:${event.data}`);
  };
  gate.push({ kind: "write", data: "replay" }, deliver);
  gate.push({ kind: "write", data: "live" }, deliver);
  expect(seen).toEqual([]);
  gate.markReady(deliver);
  expect(seen).toEqual(["write:replay", "write:live"]);
  gate.push({ kind: "clear" }, deliver);
  expect(seen).toEqual(["write:replay", "write:live", "clear"]);
});

test("dropPending forgets queued output without marking ready", () => {
  const gate = createPtyDisplayGate();
  const seen: string[] = [];
  gate.push({ kind: "write", data: "stale" }, (event) => {
    seen.push(event.kind === "write" ? event.data : "clear");
  });
  gate.dropPending();
  gate.markReady((event) => {
    seen.push(event.kind === "write" ? event.data : "clear");
  });
  expect(seen).toEqual([]);
});
