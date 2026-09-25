// Roadmap: per-Project list of Features and Fixes. See CONTEXT.md.
import type { Id } from "./dataModel";

export type RoadmapKind = "feature" | "fix";
export type RoadmapStatus = "idea" | "planned" | "in_progress" | "done" | "dropped";
export const ROADMAP_STATUSES: RoadmapStatus[] = ["idea", "planned", "in_progress", "done", "dropped"];

export type Requirement = { id: string; text: string; done: boolean };

export type GithubLink = {
  url: string;
  kind: "issue" | "pr";
  repo: string; // owner/name
  number: number;
  title?: string;
  state?: "open" | "closed" | "merged";
  fetchedAt?: number;
};

export type RoadmapItemFields = {
  projectId: Id<"projects">;
  kind: RoadmapKind;
  title: string;
  description: string; // Markdown
  status: RoadmapStatus;
  categoryId?: Id<"roadmapCategories">;
  releaseId?: Id<"roadmapReleases">;
  tags: string[];
  requirements: Requirement[];
  links: GithubLink[];
  sessionIds: Id<"sessions">[];
  order: number; // one manual order across the whole Roadmap, ascending
};

// Fields a client may set. category/release are by name: found or created in the item's Project; null clears.
export type RoadmapItemPatch = Partial<
  Pick<RoadmapItemFields, "kind" | "title" | "description" | "status" | "tags" | "requirements">
> & { category?: string | null; release?: string | null };

const KIND_LABEL: Record<RoadmapKind, string> = { feature: "Feature", fix: "Fix" };

// First message of a Session started from a Roadmap Item. Pre-filled, not sent.
export function roadmapPrompt(item: Pick<RoadmapItemFields, "kind" | "title" | "description" | "requirements" | "links">) {
  const parts = [`${KIND_LABEL[item.kind]}: ${item.title}`];
  if (item.description.trim()) parts.push(item.description.trim());
  if (item.requirements.length > 0) {
    parts.push(["Requirements:", ...item.requirements.map((r) => `- [${r.done ? "x" : " "}] ${r.text}`)].join("\n"));
  }
  if (item.links.length > 0) parts.push(["GitHub:", ...item.links.map((l) => `- ${l.url}`)].join("\n"));
  return parts.join("\n\n");
}

// Accepts a GitHub issue/PR URL, "owner/repo#123", or "#123" (uses defaultRepo). Returns null if unparseable.
export function parseGithubRef(
  input: string,
  defaultRepo: string,
): { repo: string; number: number; kind?: "issue" | "pr" } | null {
  const value = input.trim();
  const url = value.match(/^https?:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(issues|pull)\/(\d+)/i);
  if (url) {
    return { repo: url[1]!, number: Number(url[3]), kind: url[2]!.toLowerCase() === "pull" ? "pr" : "issue" };
  }
  const scoped = value.match(/^([\w.-]+\/[\w.-]+)#(\d+)$/);
  if (scoped) return { repo: scoped[1]!, number: Number(scoped[2]) };
  const bare = value.match(/^#(\d+)$/);
  if (bare && defaultRepo.trim()) return { repo: defaultRepo.trim(), number: Number(bare[1]) };
  return null;
}

// Extracts "- [ ] text" / "- [x] text" (also "*") checklist lines from Markdown.
export function requirementsFromMarkdown(body: string): { text: string; done: boolean }[] {
  const requirements: { text: string; done: boolean }[] = [];
  for (const line of body.split("\n")) {
    const match = line.trim().match(/^[-*]\s+\[([ xX])\]\s+(.+)$/);
    if (!match) continue;
    const text = match[2]!.trim();
    if (text) requirements.push({ text, done: match[1]!.toLowerCase() === "x" });
  }
  return requirements;
}
