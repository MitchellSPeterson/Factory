import { describe, expect, test } from "bun:test";
import { assemblePrompt, buildLaunchPrompt, estimateTokens } from "./prompt";

describe("prompt context", () => {
  test("estimateTokens is roughly chars/4", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  test("buildLaunchPrompt matches the Factory launch prompt shape", () => {
    const input = {
      stageKey: "plan",
      request: "Ship dark mode",
      projectName: "VASA",
      projectKind: "web",
      acceptedSpec: "Toggle in settings",
      skills: [
        { slug: "grill", title: "Grill", body: "Ask sharp questions." },
        { slug: "spec", title: "Spec", body: "Write a thin spec." },
      ],
    };
    const { prompt, segments } = buildLaunchPrompt(input);
    expect(assemblePrompt(input)).toBe(prompt);
    expect(prompt).toContain("Ship dark mode");
    expect(prompt).toContain("Accepted spec");
    expect(prompt).toContain("## Skill: Grill");
    expect(segments.map((s) => s.key)).toEqual([
      "instructions",
      "request",
      "spec",
      "skill:grill",
      "skill:spec",
    ]);
    expect(segments.every((s) => s.tokens > 0)).toBe(true);
  });
});
