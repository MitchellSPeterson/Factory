import { expect, test } from "bun:test";
import { isCompactDraft, slashItems, slashQuery } from "./composerSlash";

const skills = [
  {
    id: "1",
    slug: "grilling",
    title: "Grilling",
    description: "Interview the human until you share an understanding.",
  },
  {
    id: "2",
    slug: "domain-modeling",
    title: "Domain modeling",
    description: "Name the things the product is about.",
  },
  {
    id: "3",
    slug: "adapt",
    title: "Adapt",
    description: "Adapt designs to work across different screen sizes.",
  },
];

test("isCompactDraft is a leading /compact token", () => {
  expect(isCompactDraft("/compact")).toBe(true);
  expect(isCompactDraft("/compact keep auth")).toBe(true);
  expect(isCompactDraft("please /compact")).toBe(false);
  expect(isCompactDraft("/compaction")).toBe(false);
});

test("slashQuery is active only for a leading slash token", () => {
  expect(slashQuery("")).toBeNull();
  expect(slashQuery("hello")).toBeNull();
  expect(slashQuery("/")).toBe("");
  expect(slashQuery("/model")).toBe("model");
  expect(slashQuery("/model now")).toBeNull();
  expect(slashQuery(" /model")).toBeNull();
});

test("empty slash lists commands before skills", () => {
  const items = slashItems("", skills);
  expect(items[0]).toMatchObject({ kind: "command", id: "model" });
  expect(items.some((item) => item.kind === "command" && item.id === "compact")).toBe(false);
  expect(items.filter((item) => item.kind === "skill").map((item) => item.slug)).toEqual([
    "grilling",
    "domain-modeling",
    "adapt",
  ]);
});

test("compact is listed for an existing conversation", () => {
  const items = slashItems("", skills, { compact: true });
  expect(items.map((item) => (item.kind === "command" ? item.name : item.slug))).toEqual([
    "/model",
    "/compact",
    "grilling",
    "domain-modeling",
    "adapt",
  ]);
  expect(slashItems("comp", skills, { compact: true }).map((item) =>
    item.kind === "command" ? item.name : item.slug,
  )).toEqual(["/compact"]);
});

test("typing filters commands and skills", () => {
  expect(slashItems("mod", skills).map((item) => item.kind === "command" ? item.name : item.slug)).toEqual([
    "/model",
    "domain-modeling",
  ]);
  expect(slashItems("grill", skills).map((item) => item.kind === "skill" ? item.slug : item.name)).toEqual([
    "grilling",
  ]);
  expect(slashItems("switch", skills).map((item) => item.kind === "command" ? item.id : item.slug)).toEqual([
    "model",
  ]);
});

test("skill: prefix keeps skills and hides commands", () => {
  const items = slashItems("skill:ad", skills);
  expect(items.every((item) => item.kind === "skill")).toBe(true);
  expect(items.map((item) => item.kind === "skill" ? item.slug : "")).toEqual(["adapt"]);
  expect(slashItems("skill", skills).some((item) => item.kind === "command")).toBe(false);
});
