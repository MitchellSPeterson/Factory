export type SlashSkill = {
  id: string;
  slug: string;
  title: string;
  description: string;
};

export type SlashCommand = {
  kind: "command";
  id: "model" | "compact";
  name: "/model" | "/compact";
  description: string;
};

export type SlashSkillItem = {
  kind: "skill";
  id: string;
  slug: string;
  name: string;
  description: string;
};

export type SlashItem = SlashCommand | SlashSkillItem;

export const SLASH_COMMANDS: SlashCommand[] = [
  { kind: "command", id: "model", name: "/model", description: "Switch model" },
  {
    kind: "command",
    id: "compact",
    name: "/compact",
    description: "Summarize the conversation and reduce context",
  },
];

export function isCompactDraft(text: string): boolean {
  return /^\/compact(?:\s|$)/i.test(text.trim());
}

/** ponytail: slash mode is the whole field (`/` or `/mod`), not an inline token */
export function slashQuery(text: string): string | null {
  if (!text.startsWith("/")) return null;
  if (/\s/.test(text)) return null;
  return text.slice(1);
}

export function slashItems(
  query: string,
  skills: readonly SlashSkill[],
  options: { compact?: boolean } = {},
): SlashItem[] {
  const commands = SLASH_COMMANDS.filter((item) => {
    if (item.id === "compact" && options.compact !== true) return false;
    return matchesCommand(query, item);
  });
  const skillRows: SlashSkillItem[] = skills
    .filter((skill) => matchesSkill(query, skill))
    .map((skill) => ({
      kind: "skill",
      id: skill.id,
      slug: skill.slug,
      name: skill.slug,
      description: skill.description,
    }));
  return [...commands, ...skillRows];
}

function normalize(query: string): { skillOnly: boolean; needle: string } {
  const raw = query.toLowerCase();
  if (raw === "skill" || raw.startsWith("skill:")) {
    return {
      skillOnly: true,
      needle: raw.startsWith("skill:") ? raw.slice(6) : "",
    };
  }
  return { skillOnly: false, needle: raw };
}

function matchesCommand(query: string, item: SlashCommand): boolean {
  const { skillOnly, needle } = normalize(query);
  if (skillOnly) return false;
  if (needle === "") return true;
  return (
    item.name.slice(1).includes(needle) ||
    item.description.toLowerCase().includes(needle)
  );
}

function matchesSkill(query: string, skill: SlashSkill): boolean {
  const { needle } = normalize(query);
  if (needle === "") return true;
  return (
    skill.slug.toLowerCase().includes(needle) ||
    skill.title.toLowerCase().includes(needle) ||
    skill.description.toLowerCase().includes(needle)
  );
}
