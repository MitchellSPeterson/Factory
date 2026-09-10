export type Repository = { id: number; full_name: string; private: boolean; description: string | null };
export async function github<T>(token: string, path: string, signal?: AbortSignal): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid GitHub API path.");
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("GitHub rejected this token. It may have expired or was revoked. Connect with a valid token.");
    if (response.status === 429 || response.headers.get("x-ratelimit-remaining") === "0") throw new Error("GitHub's request limit was reached. Try again after the limit resets.");
    if (response.status === 403) throw new Error("GitHub denied access. Check repository permissions and organization approval.");
    if (response.status === 404) throw new Error("Repository not found or not available to this GitHub connection.");
    throw new Error(`GitHub could not load this information (${response.status}). Try again.`);
  }
  return response.json() as Promise<T>;
}
