/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { skillBlurb } from "./skills";

const modules = import.meta.glob("./**/*.ts");

test("skillBlurb prefers description, then the first body line", () => {
  expect(skillBlurb({ title: "Grilling", body: "# Grilling\n\nAsk first.", description: " Interview. " })).toBe(
    "Interview.",
  );
  expect(skillBlurb({ title: "Grilling", body: "# Grilling\n\nAsk first." })).toBe("Ask first.");
  expect(skillBlurb({ title: "Grilling", body: "" })).toBe("Grilling");
});

test("catalog lists Skills without bodies", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    await ctx.db.insert("skills", {
      slug: "grilling",
      title: "Grilling",
      body: "# Grilling\n\nInterview the human until you share an understanding.",
      sourceHint: "test",
    });
  });
  const rows = await t.query(api.skills.catalog, {});
  expect(rows).toEqual([
    {
      _id: rows[0]?._id,
      slug: "grilling",
      title: "Grilling",
      description: "Interview the human until you share an understanding.",
    },
  ]);
});
