import { expect, test } from "vitest";
import { takeLeadingSkillMentions, withSkillMentions } from "./sessionText";

test("withSkillMentions prefixes missing skill tokens", () => {
  expect(withSkillMentions("Do the thing", [])).toBe("Do the thing");
  expect(withSkillMentions("Do the thing", ["adapt"])).toBe("skill:adapt\n\nDo the thing");
  expect(withSkillMentions("skill:adapt already", ["adapt"])).toBe("skill:adapt already");
  expect(withSkillMentions("", ["adapt", "animate"])).toBe("skill:adapt skill:animate");
});

test("takeLeadingSkillMentions peels copied skill prefixes", () => {
  expect(takeLeadingSkillMentions("Do the thing")).toEqual({
    text: "Do the thing",
    slugs: [],
  });
  expect(takeLeadingSkillMentions("skill:adapt already")).toEqual({
    text: "skill:adapt already",
    slugs: [],
  });
  expect(takeLeadingSkillMentions(withSkillMentions("Plan the sidebar", ["adapt"]))).toEqual({
    text: "Plan the sidebar",
    slugs: ["adapt"],
  });
  expect(takeLeadingSkillMentions(withSkillMentions("", ["adapt", "animate"]))).toEqual({
    text: "",
    slugs: ["adapt", "animate"],
  });
});
