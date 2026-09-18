import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type RepoSkill = {
  slug: string;
  title: string;
  description: string;
  relPath: string;
};

const PROJECT_SKILL_DIRS = [
  ".agents/skills",
  ".claude/skills",
  ".codex/skills",
  ".grok/skills",
  "skills",
];

export function userSkillDirs(home = os.homedir()): string[] {
  return [
    path.join(home, ".agents/skills"),
    path.join(home, ".claude/skills"),
    path.join(home, ".codex/skills"),
    path.join(home, ".grok/skills"),
  ];
}

export function parseSkillFile(body: string, folder: string): { slug: string; title: string; description: string } {
  const slug = folder.trim() || "skill";
  let title = slug;
  let description = "";
  const fence = body.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fence?.[1]) {
    const name = field(fence[1], "name");
    if (name) title = name;
    description = field(fence[1], "description");
  }
  if (description === "") {
    description =
      body
        .split("\n")
        .map((row) => row.trim())
        .find((row) => row !== "" && !row.startsWith("#") && row !== "---") ?? title;
  }
  return { slug, title, description };
}

function field(block: string, key: string): string {
  const match = block.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  if (!match?.[1]) return "";
  return match[1].trim().replace(/^['"]|['"]$/g, "");
}

export async function listRepoSkills(
  projectRoot: string,
  extraDirs: string[] = [],
): Promise<RepoSkill[]> {
  const out: RepoSkill[] = [];
  const seen = new Set<string>();
  async function scan(base: string, relPrefix: string) {
    let names: string[];
    try {
      names = await readdir(base);
    } catch {
      return;
    }
    for (const name of names) {
      const skillFile = path.join(base, name, "SKILL.md");
      try {
        const info = await stat(skillFile);
        if (!info.isFile()) continue;
      } catch {
        continue;
      }
      const body = await readFile(skillFile, "utf8");
      const meta = parseSkillFile(body, name);
      if (seen.has(meta.slug)) continue;
      seen.add(meta.slug);
      out.push({ ...meta, relPath: path.join(relPrefix, name, "SKILL.md") });
    }
  }
  for (const dir of PROJECT_SKILL_DIRS) {
    await scan(path.join(projectRoot, dir), dir);
  }
  for (const dir of extraDirs) {
    await scan(dir, dir);
  }
  out.sort((a, b) => a.slug.localeCompare(b.slug));
  return out;
}
