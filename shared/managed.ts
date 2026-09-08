export const serverVariableNames = ["FACTORY_PROVIDER", "CURSOR_API_KEY", "OPENAI_API_KEY", "OPENAI_BASE_URL", "OPENAI_MODEL", "CODEX_API_KEY", "CODEX_BASE_URL", "CODEX_PATH"] as const;
export function validateVariableName(name: string, server: boolean) {
  if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(name)) throw new Error("Use an environment variable name such as DATABASE_URL.");
  if (server) {
    if (!(serverVariableNames as readonly string[]).includes(name)) throw new Error("Choose a supported server setting.");
  } else if (/^(FACTORY_|CONVEX_|CURSOR_|CODEX_|OPENAI_|GIT_|BUN_|NODE_|LD_|DYLD_)/.test(name) || ["PATH", "HOME", "SHELL", "ENV", "BASH_ENV", "ZDOTDIR", "NODE_OPTIONS"].includes(name)) {
    throw new Error("This name is reserved for worker configuration.");
  }
}
export function validateRepository(repo: string) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || repo.split("/").some(part => part === "." || part === "..")) throw new Error("Use a GitHub repository in owner/repo format.");
  return repo;
}
