export const settingsTabs = ["general", "github", "projects", "providers"] as const;
export type SettingsTab = (typeof settingsTabs)[number];

export function isSettingsTab(value: string | null): value is SettingsTab {
  return value === "general" || value === "github" || value === "projects" || value === "providers";
}

export function sectionIdForTab(tab: string | null): string | null {
  if (tab === "general") return "appearance";
  if (tab === "github") return "github";
  if (tab === "projects") return "projects";
  if (tab === "providers") return "providers";
  return null;
}

export type ConnectionStatus =
  | { kind: "ready"; label: string; detail: string }
  | { kind: "blocked"; label: string; detail: string }
  | { kind: "unknown"; label: string; detail: string };

export function githubStatus(login: string | null | undefined): ConnectionStatus {
  if (login === undefined) return { kind: "unknown", label: "GitHub", detail: "Checking…" };
  if (login) return { kind: "ready", label: "GitHub", detail: `@${login} · connected` };
  return { kind: "blocked", label: "GitHub", detail: "Not connected" };
}

export function machineStatus(args: {
  name: string | null | undefined;
  online: boolean;
}): ConnectionStatus {
  if (args.name === undefined) return { kind: "unknown", label: "This machine", detail: "Checking…" };
  if (!args.name) return { kind: "blocked", label: "This machine", detail: "Not paired" };
  if (args.online) return { kind: "ready", label: "This machine", detail: "Online" };
  return { kind: "blocked", label: "This machine", detail: "Offline" };
}

export function projectsStatus(count: number | undefined): ConnectionStatus {
  if (count === undefined) return { kind: "unknown", label: "Projects", detail: "Checking…" };
  if (count === 0) return { kind: "blocked", label: "Projects", detail: "None yet" };
  if (count === 1) return { kind: "ready", label: "Projects", detail: "1 ready" };
  return { kind: "ready", label: "Projects", detail: `${count} ready` };
}
