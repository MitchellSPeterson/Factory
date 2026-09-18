import { expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { listRepoSkills, parseSkillFile, userSkillDirs } from "./repoSkills";

test("parseSkillFile uses the folder name as the slug", () => {
  expect(
    parseSkillFile(
      "---\nname: Adapt\ndescription: Adapt designs across screens.\n---\n\n# Adapt\n",
      "adapt",
    ),
  ).toEqual({
    slug: "adapt",
    title: "Adapt",
    description: "Adapt designs across screens.",
  });
});

test("listRepoSkills reads SKILL.md folders and prefers the project copy", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "factory-skills-"));
  const home = await mkdtemp(path.join(os.tmpdir(), "factory-home-"));
  await mkdir(path.join(root, ".agents/skills/adapt"), { recursive: true });
  await writeFile(
    path.join(root, ".agents/skills/adapt/SKILL.md"),
    "---\nname: Adapt\ndescription: Project adapt.\n---\n",
  );
  await mkdir(path.join(root, "skills/factory-plan"), { recursive: true });
  await writeFile(path.join(root, "skills/factory-plan/SKILL.md"), "# Plan\n\nWrite a spec.");
  await mkdir(path.join(home, ".agents/skills/adapt"), { recursive: true });
  await writeFile(
    path.join(home, ".agents/skills/adapt/SKILL.md"),
    "---\nname: Adapt\ndescription: User adapt.\n---\n",
  );
  await mkdir(path.join(home, ".agents/skills/animate"), { recursive: true });
  await writeFile(
    path.join(home, ".agents/skills/animate/SKILL.md"),
    "---\nname: Animate\ndescription: Build motion.\n---\n",
  );
  await writeFile(path.join(root, "skills/legacy.md"), "# Not a skill folder");

  const skills = await listRepoSkills(root, userSkillDirs(home));
  expect(skills.map((skill) => skill.slug)).toEqual(["adapt", "animate", "factory-plan"]);
  expect(skills.find((skill) => skill.slug === "adapt")?.description).toBe("Project adapt.");
  expect(skills.find((skill) => skill.slug === "animate")?.description).toBe("Build motion.");
});
