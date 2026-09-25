import { expect, test } from "bun:test";
import { parseGithubRef, requirementsFromMarkdown, roadmapPrompt } from "./roadmap";

test("parseGithubRef accepts urls, scoped refs, and bare numbers", () => {
  expect(parseGithubRef("https://github.com/acme/app/issues/12", "acme/app")).toEqual({
    repo: "acme/app",
    number: 12,
    kind: "issue",
  });
  expect(parseGithubRef("https://github.com/acme/app/pull/34", "acme/app")).toEqual({
    repo: "acme/app",
    number: 34,
    kind: "pr",
  });
  expect(parseGithubRef("acme/app#56", "other/repo")).toEqual({ repo: "acme/app", number: 56 });
  expect(parseGithubRef("#78", "acme/app")).toEqual({ repo: "acme/app", number: 78 });
});

test("parseGithubRef rejects unparseable or unscoped bare numbers", () => {
  expect(parseGithubRef("#78", "")).toBeNull();
  expect(parseGithubRef("not a ref", "acme/app")).toBeNull();
  expect(parseGithubRef("", "acme/app")).toBeNull();
});

test("requirementsFromMarkdown extracts checklist lines", () => {
  const body = [
    "Some intro text",
    "- [ ] first thing",
    "* [x] second thing",
    "  - [X] third thing indented",
    "- [ ]   ",
    "- not a checkbox",
  ].join("\n");
  expect(requirementsFromMarkdown(body)).toEqual([
    { text: "first thing", done: false },
    { text: "second thing", done: true },
    { text: "third thing indented", done: true },
  ]);
});

test("roadmapPrompt composes kind, title, description, requirements, and links", () => {
  const prompt = roadmapPrompt({
    kind: "fix",
    title: "Crash on launch",
    description: "Happens on cold start.",
    requirements: [
      { id: "1", text: "Reproduce it", done: true },
      { id: "2", text: "Add a regression test", done: false },
    ],
    links: [{ url: "https://github.com/acme/app/issues/1", kind: "issue", repo: "acme/app", number: 1 }],
  });
  expect(prompt).toContain("Fix: Crash on launch");
  expect(prompt).toContain("Happens on cold start.");
  expect(prompt).toContain("- [x] Reproduce it");
  expect(prompt).toContain("- [ ] Add a regression test");
  expect(prompt).toContain("https://github.com/acme/app/issues/1");
});
