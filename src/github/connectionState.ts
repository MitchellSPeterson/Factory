export const GITHUB_CONNECTION_STORAGE_KEY = "factory-github-connection";

export type StoredGitHubConnection = { token: string; login: string };

function isStoredConnection(value: unknown): value is StoredGitHubConnection {
  if (typeof value !== "object" || value === null) return false;
  if (!("token" in value) || !("login" in value)) return false;
  return typeof value.token === "string" && value.token.trim() !== "" && typeof value.login === "string" && value.login.trim() !== "";
}

export function connectionFromStorage(value: string | null): StoredGitHubConnection | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isStoredConnection(parsed) ? { token: parsed.token, login: parsed.login } : null;
  } catch {
    return null;
  }
}

export function readStoredConnection(): StoredGitHubConnection | null {
  try {
    return connectionFromStorage(localStorage.getItem(GITHUB_CONNECTION_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeStoredConnection(connection: StoredGitHubConnection | null): void {
  try {
    if (connection) localStorage.setItem(GITHUB_CONNECTION_STORAGE_KEY, JSON.stringify({ token: connection.token, login: connection.login }));
    else localStorage.removeItem(GITHUB_CONNECTION_STORAGE_KEY);
  } catch {
    // private browsing, disabled storage, or quota
  }
}
