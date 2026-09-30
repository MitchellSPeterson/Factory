import { expect, test } from "bun:test";
import { grokResumeId } from "./grokAgent";

test("Grok resume ids drop the grok- prefix", () => {
  expect(grokResumeId("grok-abc")).toBe("abc");
  expect(grokResumeId("abc")).toBe("abc");
  expect(grokResumeId(undefined)).toBeUndefined();
});
