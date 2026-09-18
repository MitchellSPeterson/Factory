export function withSkillMentions(text: string, slugs: readonly string[]): string {
  const missing = slugs.filter((slug) => slug !== "" && !text.includes(`skill:${slug}`));
  if (missing.length === 0) return text;
  const line = missing.map((slug) => `skill:${slug}`).join(" ");
  const trimmed = text.trim();
  return trimmed === "" ? line : `${line}\n\n${trimmed}`;
}

export function takeLeadingSkillMentions(text: string): { text: string; slugs: string[] } {
  const trimmed = text.trim();
  const match = trimmed.match(
    /^(skill:[^\s]+(?:[ \t]+skill:[^\s]+)*)(?:\n+([\s\S]*)|[ \t]*)$/,
  );
  if (!match?.[1]) return { text: trimmed, slugs: [] };
  const slugs = match[1]
    .split(/[ \t]+/)
    .map((token) => token.slice("skill:".length))
    .filter((slug) => slug !== "");
  return { text: (match[2] ?? "").trim(), slugs };
}
