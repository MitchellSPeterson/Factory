import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const TITLES: Record<string, string> = {
  "factory-plan": "Plan",
  "domain-modeling": "Domain modeling",
  grilling: "Grilling",
  "poteto-feature": "Implement (Feature)",
  verify: "Verify",
  "opening-pr": "Open a PR",
};

const HINTS: Record<string, string> = {
  "factory-plan": "factory",
  "domain-modeling": "~/.agents/skills/domain-modeling",
  grilling: "~/.agents/skills/grilling",
  "poteto-feature": "pstack poteto-mode / Feature",
  verify: "factory",
  "opening-pr": "pstack opening-a-pr",
};

export async function loadSkillFiles(root = process.cwd()) {
  const dir = path.join(root, "skills");
  const names = await readdir(dir);
  const skills = [];
  for (const name of names) {
    if (!name.endsWith(".md")) continue;
    const slug = name.replace(/\.md$/, "");
    const body = await readFile(path.join(dir, name), "utf8");
    skills.push({
      slug,
      title: TITLES[slug] ?? slug,
      body,
      sourceHint: HINTS[slug] ?? "factory",
    });
  }
  return skills;
}
