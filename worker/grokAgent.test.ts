import { expect, test } from "bun:test";
import { grokArgs, grokPromptBlocks, grokResumeId, grokRules, parseGrokEvent } from "./grokAgent";

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

test("Stage Grok keeps Factory rules and skips resume", () => {
  const args = grokArgs({
    prompt: "Ship it",
    workingDirectory: "/project",
    model: "grok-4.6",
    effort: "high",
    mode: "stage",
    root: "/factory",
  });
  expect(args).toContain("--no-plan");
  expect(args).toContain("--rules");
  expect(args).toContain(grokRules("/factory"));
  expect(args.includes("-r")).toBe(false);
});

test("Session Grok resumes the stored Grok session and skips Factory stage rules", () => {
  expect(grokResumeId("grok-abc")).toBe("abc");
  expect(grokResumeId("abc")).toBe("abc");
  const args = grokArgs({
    prompt: "What does auth do?",
    workingDirectory: "/project",
    model: "grok-4.6",
    effort: "medium",
    mode: "session",
    root: "/factory",
    resumeSessionId: "abc",
  });
  expect(args).not.toContain("--no-plan");
  expect(args).not.toContain("--rules");
  expect(args.slice(args.indexOf("-r"), args.indexOf("-r") + 2)).toEqual(["-r", "abc"]);
});

test("Session Grok with images uses a prompt file instead of -p", () => {
  expect(grokPromptBlocks("", ["/tmp/shot.png"])).toEqual([
    { type: "text", text: "See the attached image." },
    { type: "image", path: "/tmp/shot.png" },
  ]);
  const args = grokArgs({
    prompt: "Look",
    workingDirectory: "/project",
    model: "grok-4.6",
    effort: "medium",
    mode: "session",
    root: "/factory",
    promptFile: "/tmp/prompt.json",
  });
  expect(args.slice(0, 2)).toEqual(["--prompt-file", "/tmp/prompt.json"]);
  expect(args.includes("-p")).toBe(false);
});
