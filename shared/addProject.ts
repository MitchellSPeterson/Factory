import { validateRepository } from "./managed";

export type AddStep = "choose" | "folder" | "github-connect" | "github-list";

export type GithubRepo = {
  repo: string;
  description: string;
};

export function nameFromPath(localPath: string): string {
  const last = localPath.split("/").filter(Boolean).at(-1);
  return last?.trim() || "Project";
}

export function nameFromRepo(repo: string): string {
  const last = repo.split("/").filter(Boolean).at(-1);
  return last?.trim() || "Project";
}

export function typedRepo(value: string): string | null {
  try {
    return validateRepository(value.trim()).toLowerCase();
  } catch {
    return null;
  }
}

export function filterRepos(repos: GithubRepo[], filter: string): GithubRepo[] {
  const query = filter.trim().toLowerCase();
  if (!query) return repos;
  return repos.filter(
    (row) =>
      row.repo.toLowerCase().includes(query) || row.description.toLowerCase().includes(query),
  );
}

export function reposForFilter(repos: GithubRepo[], filter: string): GithubRepo[] {
  const listed = filterRepos(repos, filter);
  const typed = typedRepo(filter);
  if (!typed || listed.some((row) => row.repo.toLowerCase() === typed)) return listed;
  return [{ repo: typed, description: "" }, ...listed];
}

export function githubRepoFromRemote(url: string): string | null {
  const trimmed = url.trim();
  const ssh = trimmed.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (ssh) return typedRepo(`${ssh[1]}/${ssh[2]}`);
  const hosted = trimmed.match(/^https?:\/\/(?:[^@/]+@)?github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/i);
  if (hosted) return typedRepo(`${hosted[1]}/${hosted[2]}`);
  return null;
}

export function projectPictureUrl(githubRepo: string): string | null {
  const repo = typedRepo(githubRepo);
  const owner = repo?.split("/")[0];
  if (!owner) return null;
  return `https://github.com/${owner}.png?size=80`;
}

export function existingProjectId(
  projects: Array<{ _id: string; localPath?: string; githubRepo?: string }>,
  want: { localPath?: string; githubRepo?: string },
): string | null {
  if (want.githubRepo) {
    const repo = want.githubRepo.trim().toLowerCase();
    const match = projects.find((row) => String(row.githubRepo ?? "").toLowerCase() === repo);
    if (match) return match._id;
  }
  if (want.localPath) {
    const path = want.localPath.replace(/\/+$/, "");
    const match = projects.find((row) => String(row.localPath ?? "").replace(/\/+$/, "") === path);
    if (match) return match._id;
  }
  return null;
}
