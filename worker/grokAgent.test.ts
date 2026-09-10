import { expect, test } from "bun:test";
import { grokRules, parseGrokEvent } from "./grokAgent";

test("Grok streaming events expose text, usage, and session identity", () => {
  expect(parseGrokEvent('{"type":"text","data":"hello"}')).toEqual({ type: "text", data: "hello" });
  expect(parseGrokEvent('{"type":"end","sessionId":"grok-1","usage":{"input_tokens":3}}')?.sessionId).toBe("grok-1");
  expect(parseGrokEvent("not json")).toBeNull();
});

test("Grok receives the Factory lifecycle bridge", () => {
  const rules = grokRules("/factory");
  expect(rules).toContain("/factory/worker/grokBridge.ts");
  expect(rules).toContain("finish_stage");
  expect(rules).toContain("submit_artifact");
});
