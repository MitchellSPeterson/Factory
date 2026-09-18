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

export function grokHome(home = os.homedir(), env = process.env): string {
  const fromEnv = env.GROK_HOME?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.join(home, ".grok");
}

/** User- and system-installed Skills on this machine, outside the Project. */
export function globalSkillDirs(home = os.homedir(), env = process.env): string[] {
  const grok = grokHome(home, env);
  return [
    path.join(home, ".agents/skills"),
    path.join(home, ".claude/skills"),
    path.join(home, ".codex/skills"),
    path.join(home, ".cursor/skills"),
    path.join(grok, "skills"),
    path.join(grok, "bundled/skills"),
  ];
}

export const userSkillDirs = globalSkillDirs;

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
  const lines = block.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i]?.match(new RegExp(`^${key}:\\s*(.*)$`));
    if (!match) continue;
    let value = (match[1] ?? "").trim();
    if (value === ">" || value === ">-" || value === ">+" || value === "|" || value === "|-" || value === "|+") {
      const parts = [];
      for (let j = i + 1; j < lines.length; j += 1) {
        const row = lines[j] ?? "";
        if (row.trim() === "") continue;
        if (!/^\s+/.test(row)) break;
        parts.push(row.trim());
      }
      value = parts.join(" ");
    } else {
      const parts = [value.replace(/^['"]|['"]$/g, "")];
      for (let j = i + 1; j < lines.length; j += 1) {
        const row = lines[j] ?? "";
        if (!/^\s+\S/.test(row) || /^\s+[\w-]+:\s*/.test(row)) break;
        parts.push(row.trim());
      }
      value = parts.join(" ");
    }
    return value.replace(/^['"]|['"]$/g, "");
  }
  return "";
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
