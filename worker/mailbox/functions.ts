import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { validateRepository, validateVariableName } from "../../shared/managed";
import type { ProjectOperation, OperationResult, OperationState } from "../../shared/projectOperations";
import { addUsage, isZeroUsage, subUsage, ZERO_USAGE, type TokenUsage } from "../../shared/tokenUsage";
import { takeLeadingSkillMentions, withSkillMentions } from "../../shared/sessionText";
import {
  DEFAULT_PERMISSION_MODE,
  DEFAULT_SERVICE_TIER,
  type PermissionOption,
  type SessionItemKind,
  type SessionItemStatus,
} from "../../shared/validators";
import type { Doc, Store } from "./store";

export const MAX_SESSION_MESSAGE = 16000;
export const MAX_SESSION_IMAGES = 4;
export const MAX_SESSION_SKILLS = 8;
const MAX_SESSION_TITLE = 72;
const ONLINE_MS = 45_000;
const TICKET_TTL_MS = 120_000;

export type DispatchKind = "query" | "mutation" | "action";
export type DispatchCtx = { store: Store; origin: string; uploads: string; token?: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function requireProject(store: Store, projectId: string): Doc {
  const project = store.get(projectId);
  if (!project) throw new Error("Project not found");
  return project;
}

function requireSession(store: Store, sessionId: string): Doc {
  const session = store.get(sessionId);
  if (!session) throw new Error("Session not found");
  return session;
}

function requireServer(store: Store, accessKey: string): Doc {
  if (!/^[a-f0-9]{64}$/.test(accessKey)) throw new Error("Worker identity is invalid.");
  const server = store.list("servers").find((row) => row.accessKey === accessKey);
  if (!server) throw new Error("Worker identity is invalid.");
  return server;
}

function localServer(store: Store): Doc | null {
  return [...store.list("servers")].sort((a, b) => Number(b.lastSeen) - Number(a.lastSeen) || b._creationTime - a._creationTime)[0] ?? null;
}

function resolveServer(store: Store, accessKey?: string): Doc {
  if (accessKey) return requireServer(store, accessKey);
  const server = localServer(store);
  if (!server) throw new Error("This machine is offline. Start the worker.");
  return server;
}

function requireProjectServer(store: Store, project: Doc, accessKey?: string) {
  if (!project.serverId) return;
  const server = resolveServer(store, accessKey);
  if (server._id !== project.serverId) throw new Error("This Project belongs to another worker.");
}

function toServerView(server: Doc) {
  return {
    id: server._id,
    name: server.name,
    publicKey: server.publicKey,
    projectsRoot: server.projectsRoot,
    lastSeen: server.lastSeen,
    grokCatalog: server.grokCatalog,
    providerUsage: server.providerUsage,
    simHubWanted: server.simHubWanted,
    simHub: server.simHub,
  };
}

export function titleFrom(text: string, imageCount = 0, fallback = ""): string {
  const one = text.trim().replace(/\s+/g, " ");
  if (one === "") {
    if (fallback !== "") return fallback;
    return imageCount > 0 ? "Image" : "New session";
  }
  if (one.length <= MAX_SESSION_TITLE) return one;
  return `${one.slice(0, MAX_SESSION_TITLE - 1).trimEnd()}…`;
}

export function isCompactCommand(text: string): boolean {
  return /^\/compact(?:\s|$)/i.test(text.trim());
}

export function compactSessionPrompt(text: string): string {
  const extra = text.trim().replace(/^\/compact\b/i, "").trim();
  const request =
    "Summarize this conversation so later turns can continue with less context. Keep decisions, file paths, and unfinished work. Drop chit-chat.";
  return extra === "" ? request : `${request}\n\n${extra}`;
}

function requireMessageText(text: string, imageCount = 0, skillCount = 0): string {
  const trimmed = text.trim();
  if (trimmed === "" && imageCount === 0 && skillCount === 0) throw new Error("Message is required");
  if (trimmed.length > MAX_SESSION_MESSAGE) {
    throw new Error(`A message can be at most ${MAX_SESSION_MESSAGE} characters`);
  }
  return trimmed;
}

function requireSkillSlugs(slugs: string[] | undefined): string[] {
  const unique = [...new Set((slugs ?? []).map((slug) => slug.trim()).filter((slug) => slug !== ""))];
  if (unique.length > MAX_SESSION_SKILLS) {
    throw new Error(`A message can include at most ${MAX_SESSION_SKILLS} Skills`);
  }
  return unique;
}

function requireImageIds(ids: string[] | undefined): string[] {
  const imageIds = ids ?? [];
  if (imageIds.length > MAX_SESSION_IMAGES) {
    throw new Error(`A message can have at most ${MAX_SESSION_IMAGES} images`);
  }
  return imageIds;
}

function urlsFor(origin: string, ids: string[] | undefined) {
  return (ids ?? []).map((id) => `${origin}/uploads/${id}`);
}

function busy(status: unknown): boolean {
  return status === "queued" || status === "running";
}

function sessionMessages(store: Store, sessionId: string): Doc[] {
  return store
    .list("sessionMessages")
    .filter((row) => row.sessionId === sessionId)
    .sort((a, b) => Number(a.createdAt) - Number(b.createdAt));
}

function expirePendingPermissions(store: Store, sessionId: string) {
  for (const row of sessionMessages(store, sessionId)) {
    if (row.kind === "permission" && row.status === "pending") {
      store.patch(row._id, { status: "failed" });
    }
  }
}

function closeTurn(store: Store, session: Doc, status: string, error?: string) {
  expirePendingPermissions(store, session._id);
  const extra = session.turnStartedAt !== undefined ? Math.max(0, Date.now() - Number(session.turnStartedAt)) : 0;
  store.patch(session._id, {
    status,
    error,
    turnStartedAt: undefined,
    durationMs: Number(session.durationMs ?? 0) + extra,
  });
}

function isLogMessage(message: Doc) {
  return message.role === "assistant" && (message.kind === undefined || message.kind === "message");
}

function skillBlurb(skill: { title: string; body: string; description?: string }): string {
  const named = skill.description?.trim();
  if (named) return named;
  const line = skill.body
    .split("\n")
    .map((row) => row.trim())
    .find((row) => row !== "" && !row.startsWith("#") && row !== "---");
  return line ?? skill.title;
}

function checkScope(store: Store, serverId: string, scope: string) {
  if (scope === "server") return;
  const project = store.get(scope);
  if (!project || project.serverId !== serverId) throw new Error("Choose a Project belonging to this worker.");
}

function sameDeviceCommand(
  left: { kind: string; udid?: string; name?: string },
  right: { kind: string; udid?: string; name?: string },
) {
  return left.kind === right.kind && left.udid === right.udid && left.name === right.name;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function terminalSize(cols: number, rows: number) {
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || cols > 500 || rows < 1 || rows > 200) {
    throw new Error("Invalid terminal size.");
  }
}

async function deviceRequest(pathName: string, fields: Record<string, string>) {
  const response = await fetch(`https://github.com/login/${pathName}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  if (!response.ok) throw new Error("GitHub sign-in is unavailable. Try again shortly.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("Unexpected GitHub response.");
  return data as Record<string, unknown>;
}

function githubClient(value: string) {
  if (!/^[A-Za-z0-9_.-]{10,100}$/.test(value)) throw new Error("Enter a valid GitHub App client ID.");
  return value;
}

function requireConnection(login: string, token: string) {
  const next = { login: login.trim(), token: token.trim() };
  if (!next.login || next.login.length > 100 || !next.token || next.token.length > 10000) {
    throw new Error("Invalid GitHub connection.");
  }
  return next;
}

const handlers: Record<string, (args: Record<string, unknown>, ctx: DispatchCtx) => unknown | Promise<unknown>> = {
  "sessions.list": (_args, { store }) => {
    const sessions = store.list("sessions");
    return sessions.map((session) => {
      const project = typeof session.projectId === "string" ? store.get(session.projectId) : null;
      return { session, projectName: project?.name ?? "missing" };
    });
  },
  "sessions.get": (args, { store, origin }) => {
    const session = store.get(String(args.sessionId ?? ""));
    if (!session) return null;
    const project = typeof session.projectId === "string" ? store.get(session.projectId) : null;
    if (!project) return null;
    const messages = sessionMessages(store, session._id).map((message) => ({
      ...message,
      imageUrls: urlsFor(origin, message.imageIds as string[] | undefined),
    }));
    return {
      session,
      project: {
        _id: project._id,
        name: project.name,
        kind: project.kind,
        localPath: project.localPath,
        githubRepo: project.githubRepo,
      },
      messages,
    };
  },
  "sessions.create": (args, { store }) => {
    const imageIds = requireImageIds(args.imageIds as string[] | undefined);
    const mentioned = takeLeadingSkillMentions(String(args.text ?? ""));
    const skillSlugs = requireSkillSlugs([...mentioned.slugs, ...((args.skillSlugs as string[]) ?? [])]);
    const text = requireMessageText(mentioned.text, imageIds.length, skillSlugs.length);
    if (isCompactCommand(text)) throw new Error("Compact needs an existing conversation.");
    if (String(args.model ?? "").trim() === "") throw new Error("Model is required");
    const project = requireProject(store, String(args.projectId ?? ""));
    requireProjectServer(store, project, typeof args.accessKey === "string" ? args.accessKey : undefined);
    if (project.serverId && project.cloneStatus !== "ready") {
      throw new Error("Wait for the Project to finish cloning before starting a Session.");
    }
    const sessionId = store.insert("sessions", {
      projectId: project._id,
      title: titleFrom(text, imageIds.length, skillSlugs[0] ?? ""),
      provider: args.provider,
      model: String(args.model).trim(),
      effort: args.effort,
      permissionMode: args.permissionMode ?? DEFAULT_PERMISSION_MODE,
      serviceTier: args.serviceTier ?? DEFAULT_SERVICE_TIER,
      status: "queued",
    });
    store.insert("sessionMessages", {
      sessionId,
      role: "user",
      text,
      imageIds: imageIds.length > 0 ? imageIds : undefined,
      skillSlugs: skillSlugs.length > 0 ? skillSlugs : undefined,
      createdAt: Date.now(),
    });
    return sessionId;
  },
  "sessions.generateUploadUrl": (_args, { origin, token }) =>
    `${origin}/upload${token ? `?token=${encodeURIComponent(token)}` : ""}`,
  "sessions.configure": (args, { store }) => {
    const session = requireSession(store, String(args.sessionId ?? ""));
    if (busy(session.status)) throw new Error("Wait for the current turn to finish.");
    if (String(args.model ?? "").trim() === "") throw new Error("Model is required");
    const providerChanged = args.provider !== session.provider;
    store.patch(session._id, {
      provider: args.provider,
      model: String(args.model).trim(),
      effort: args.effort,
      permissionMode: args.permissionMode ?? session.permissionMode ?? DEFAULT_PERMISSION_MODE,
      serviceTier: args.serviceTier ?? session.serviceTier ?? DEFAULT_SERVICE_TIER,
      ...(providerChanged ? { agentId: undefined } : {}),
    });
    return null;
  },
  "sessions.send": (args, { store }) => {
    const session = requireSession(store, String(args.sessionId ?? ""));
    if (busy(session.status)) throw new Error("Wait for the current turn to finish.");
    const imageIds = requireImageIds(args.imageIds as string[] | undefined);
    const mentioned = takeLeadingSkillMentions(String(args.text ?? ""));
    const skillSlugs = requireSkillSlugs([...mentioned.slugs, ...((args.skillSlugs as string[]) ?? [])]);
    const text = requireMessageText(mentioned.text, imageIds.length, skillSlugs.length);
    expirePendingPermissions(store, session._id);
    store.insert("sessionMessages", {
      sessionId: session._id,
      role: "user",
      text,
      imageIds: imageIds.length > 0 ? imageIds : undefined,
      skillSlugs: skillSlugs.length > 0 ? skillSlugs : undefined,
      createdAt: Date.now(),
    });
    store.patch(session._id, {
      status: "queued",
      error: undefined,
      title: session.title === "New session" ? titleFrom(text, imageIds.length, skillSlugs[0] ?? "") : session.title,
    });
    return null;
  },
  "sessions.stop": (args, { store }) => {
    const session = requireSession(store, String(args.sessionId ?? ""));
    if (!busy(session.status)) return null;
    closeTurn(store, session, "stopped");
    return null;
  },
  "sessions.remove": (args, { store, uploads }) => {
    const session = requireSession(store, String(args.sessionId ?? ""));
    for (const message of sessionMessages(store, session._id)) {
      for (const imageId of (message.imageIds as string[] | undefined) ?? []) {
        try {
          unlinkSync(path.join(uploads, imageId));
        } catch {
          // already gone
        }
      }
      store.delete(message._id);
    }
    store.delete(session._id);
    return null;
  },
  "sessions.listQueued": (_args, { store }) =>
    store.list("sessions").filter((session) => session.status === "queued").map((session) => session._id),
  "sessions.claim": (args, { store, origin }) => {
    const session = store.get(String(args.sessionId ?? ""));
    if (!session || session.status !== "queued") return null;
    const project = requireProject(store, String(session.projectId));
    if (project.serverId) {
      if (typeof args.accessKey !== "string") return null;
      try {
        requireProjectServer(store, project, args.accessKey);
      } catch {
        return null;
      }
      if (project.cloneStatus !== "ready") return null;
    }
    const lastUser = [...sessionMessages(store, session._id)].reverse()[0];
    if (!lastUser || lastUser.role !== "user") {
      store.patch(session._id, { status: "failed", error: "Session has no user message." });
      return null;
    }
    store.patch(session._id, { status: "running", turnStartedAt: Date.now(), error: undefined });
    const imageUrls = urlsFor(origin, lastUser.imageIds as string[] | undefined);
    return {
      sessionId: session._id,
      prompt: isCompactCommand(String(lastUser.text))
        ? compactSessionPrompt(String(lastUser.text))
        : withSkillMentions(String(lastUser.text), (lastUser.skillSlugs as string[]) ?? []),
      provider: session.provider,
      model: session.model,
      effort: session.effort,
      permissionMode: session.permissionMode ?? DEFAULT_PERMISSION_MODE,
      serviceTier: session.serviceTier ?? DEFAULT_SERVICE_TIER,
      agentId: session.agentId,
      images: imageUrls.map((url) => ({ url })),
      project: {
        id: project._id,
        serverId: project.serverId,
        name: project.name,
        kind: project.kind,
        localPath: project.localPath,
        githubRepo: project.githubRepo,
      },
    };
  },
  "sessions.bindAgent": (args, { store }) => {
    requireSession(store, String(args.sessionId ?? ""));
    store.patch(String(args.sessionId), { agentId: args.agentId });
    return null;
  },
  "sessions.appendMessage": (args, { store }) => {
    const session = requireSession(store, String(args.sessionId ?? ""));
    if (args.text === "") return null;
    const last = [...sessionMessages(store, session._id)].reverse()[0];
    if (last && isLogMessage(last)) {
      store.patch(last._id, { text: String(last.text) + String(args.text) });
      return null;
    }
    store.insert("sessionMessages", {
      sessionId: session._id,
      role: "assistant",
      kind: "message",
      text: args.text,
      createdAt: Date.now(),
    });
    return null;
  },
  "sessions.upsertItem": (args, { store }) => {
    const session = requireSession(store, String(args.sessionId ?? ""));
    const rows = sessionMessages(store, session._id);
    const existing = rows.find((row) => row.itemId === args.itemId && row.kind === args.kind);
    const nextText = (args.text as string | undefined) ?? (existing?.text as string | undefined) ?? "";
    if (existing) {
      store.patch(existing._id, {
        title: args.title ?? existing.title,
        detail: args.detail ?? existing.detail,
        status: args.status ?? existing.status,
        text: args.kind === "reasoning" && args.text ? `${String(existing.text)}${String(args.text)}` : nextText,
        requestId: args.requestId ?? existing.requestId,
        options: args.options ?? existing.options,
      });
      return null;
    }
    store.insert("sessionMessages", {
      sessionId: session._id,
      role: "assistant",
      kind: args.kind as SessionItemKind,
      itemId: args.itemId,
      title: args.title,
      detail: args.detail,
      status: args.status as SessionItemStatus | undefined,
      text: nextText,
      requestId: args.requestId,
      options: args.options as PermissionOption[] | undefined,
      createdAt: Date.now(),
    });
    return null;
  },
  "sessions.resolvePermission": (args, { store }) => {
    const session = requireSession(store, String(args.sessionId ?? ""));
    if (session.status !== "running") return null;
    const pending = sessionMessages(store, session._id).find(
      (row) => row.kind === "permission" && row.requestId === args.requestId && row.status === "pending",
    );
    if (!pending) return null;
    const options = (pending.options as PermissionOption[] | undefined) ?? [];
    const allowed = options.some((option) => option.optionId === args.optionId);
    if (!allowed) throw new Error("Unknown approval option.");
    const selected = options.find((option) => option.optionId === args.optionId);
    const denied = selected?.kind === "reject_once" || selected?.kind === "reject_always";
    store.patch(pending._id, { status: denied ? "denied" : "resolved", decision: args.optionId });
    return null;
  },
  "sessions.getPermission": (args, { store }) => {
    const session = store.get(String(args.sessionId ?? ""));
    if (!session) return null;
    const row = sessionMessages(store, session._id).find(
      (message) => message.kind === "permission" && message.requestId === args.requestId,
    );
    if (!row || row.status === undefined) return null;
    if (row.status === "pending") return { status: "pending" as const };
    if (row.status === "denied") return { status: "denied" as const, optionId: row.decision };
    if (row.status === "resolved") return { status: "resolved" as const, optionId: row.decision };
    if (row.status === "failed") return { status: "denied" as const };
    return null;
  },
  "sessions.recordUsage": (args, { store }) => {
    const session = requireSession(store, String(args.sessionId ?? ""));
    const next = args.usage as TokenUsage;
    const prev = (session.usage as TokenUsage | undefined) ?? ZERO_USAGE;
    const delta = subUsage(next, prev);
    if (isZeroUsage(delta) && session.usage) return null;
    store.patch(session._id, { usage: next });
    if (isZeroUsage(delta)) return null;
    const project = requireProject(store, String(session.projectId));
    store.patch(project._id, { usage: addUsage((project.usage as TokenUsage | undefined) ?? ZERO_USAGE, delta) });
    return null;
  },
  "sessions.complete": (args, { store }) => {
    const session = requireSession(store, String(args.sessionId ?? ""));
    if (session.status !== "running") return null;
    closeTurn(store, session, "idle");
    return null;
  },
  "sessions.fail": (args, { store }) => {
    const session = requireSession(store, String(args.sessionId ?? ""));
    if (session.status === "stopped") return null;
    closeTurn(store, session, "failed", String(args.error ?? ""));
    return null;
  },
  "sessions.getStatus": (args, { store }) => store.get(String(args.sessionId ?? ""))?.status ?? null,
  "projects.list": (_args, { store }) => store.list("projects").sort((a, b) => String(a.name).localeCompare(String(b.name))),
  "projects.get": (args, { store }) => store.get(String(args.projectId ?? "")),
  "projects.create": (args, { store }) => {
    if (String(args.name ?? "").trim() === "") throw new Error("Name is required");
    if (String(args.localPath ?? "").trim() === "") throw new Error("Local path is required");
    return store.insert("projects", {
      name: args.name,
      kind: args.kind,
      localPath: args.localPath,
      githubRepo: args.githubRepo,
      defaultRuntime: args.defaultRuntime,
    });
  },
  "projects.update": (args, { store }) => {
    const project = store.get(String(args.projectId ?? ""));
    if (!project) throw new Error("Project not found");
    requireProjectServer(store, project, typeof args.accessKey === "string" ? args.accessKey : undefined);
    if (project.serverId && (args.localPath !== project.localPath || args.githubRepo !== project.githubRepo)) {
      throw new Error("Managed repository paths cannot be changed. Import another repository instead.");
    }
    store.patch(String(args.projectId), {
      name: args.name,
      kind: args.kind,
      localPath: args.localPath,
      githubRepo: args.githubRepo,
      defaultRuntime: args.defaultRuntime,
    });
    return null;
  },
  "projects.remove": (args, { store }) => {
    const project = store.get(String(args.projectId ?? ""));
    if (!project) throw new Error("Project not found");
    requireProjectServer(store, project, typeof args.accessKey === "string" ? args.accessKey : undefined);
    if (project.cloneStatus === "cloning") throw new Error("Wait for cloning to finish before removing this Project.");
    for (const row of store.list("projectImports").filter((item) => item.projectId === args.projectId)) {
      store.delete(row._id);
    }
    if (project.serverId) {
      for (const row of store
        .list("environment")
        .filter((item) => item.serverId === project.serverId && item.scope === project._id)) {
        store.delete(row._id);
      }
    }
    store.delete(String(args.projectId));
    return null;
  },
  "projects.reportSkills": (args, { store }) => {
    const project = requireProject(store, String(args.projectId ?? ""));
    const server = resolveServer(store, String(args.accessKey ?? ""));
    if (project.serverId && project.serverId !== server._id) throw new Error("This Project belongs to another worker.");
    requireProjectServer(store, project, String(args.accessKey ?? ""));
    if (JSON.stringify(project.skills ?? []) === JSON.stringify(args.skills)) return null;
    store.patch(project._id, { skills: args.skills });
    return null;
  },
  "servers.register": (args, { store }) => {
    const accessKey = String(args.accessKey ?? "");
    const name = String(args.name ?? "");
    const publicKey = String(args.publicKey ?? "");
    const projectsRoot = String(args.projectsRoot ?? "");
    if (!/^[a-f0-9]{64}$/.test(accessKey) || name.length > 100 || publicKey.length > 4096 || projectsRoot.length > 1024) {
      throw new Error("Invalid worker registration.");
    }
    const old = store.list("servers").find((row) => row.accessKey === accessKey);
    if (old) {
      if (old.publicKey !== publicKey) throw new Error("Worker identity changed. Restore its identity file.");
      store.patch(old._id, { lastSeen: Date.now(), name, projectsRoot });
      return old._id;
    }
    return store.insert("servers", { accessKey, name, publicKey, projectsRoot, lastSeen: Date.now() });
  },
  "servers.paired": (args, { store }) => toServerView(requireServer(store, String(args.accessKey ?? ""))),
  "servers.local": (_args, { store }) => {
    const server = localServer(store);
    return server ? toServerView(server) : null;
  },
  "servers.reportGrokCatalog": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    store.patch(server._id, { grokCatalog: args.catalog, lastSeen: Date.now() });
    return null;
  },
  "servers.reportProviderUsage": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    const usage = asRecord(args.usage);
    const meters = Array.isArray(usage.meters) ? usage.meters : [];
    if (meters.length > 8) throw new Error("Too many provider usage meters.");
    store.patch(server._id, { providerUsage: args.usage, lastSeen: Date.now() });
    return null;
  },
  "servers.heartbeat": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    store.patch(server._id, { lastSeen: Date.now() });
    return null;
  },
  "servers.reportSimHub": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    store.patch(server._id, { simHub: args.hub, lastSeen: Date.now() });
    return null;
  },
  "servers.setSimHubWanted": (args, { store }) => {
    const server = resolveServer(store, typeof args.accessKey === "string" ? args.accessKey : undefined);
    store.patch(server._id, { simHubWanted: args.wanted });
    return null;
  },
  "servers.enqueueDeviceCommand": (args, { store }) => {
    const server = resolveServer(store, typeof args.accessKey === "string" ? args.accessKey : undefined);
    const command = asRecord(args.command) as { kind: string; udid?: string; name?: string };
    if (command.udid && (command.udid.length < 8 || command.udid.length > 80)) throw new Error("Unknown Device.");
    const open = store
      .list("deviceCommands")
      .filter((row) => row.serverId === server._id && (row.status === "queued" || row.status === "taken"));
    const duplicate = open.find((row) => sameDeviceCommand(asRecord(row.command) as { kind: string; udid?: string; name?: string }, command));
    if (duplicate) return duplicate.commandId;
    if (open.length >= 20) throw new Error("This machine already has Device work queued.");
    const commandId = `${Date.now().toString(36)}-${open.length}`;
    store.insert("deviceCommands", { serverId: server._id, commandId, command, status: "queued", leaseUntil: 0 });
    return commandId;
  },
  "servers.claimDeviceCommands": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    const now = Date.now();
    const open = store.list("deviceCommands").filter((row) => row.serverId === server._id);
    const batch = [
      ...open.filter((row) => row.status === "queued"),
      ...open.filter((row) => row.status === "taken" && Number(row.leaseUntil) < now),
    ].slice(0, 5);
    const leaseUntil = now + 60_000;
    for (const row of batch) store.patch(row._id, { status: "taken", leaseUntil });
    return {
      wanted: server.simHubWanted === true,
      commands: batch.map((row) => ({ commandId: row.commandId, command: row.command })),
    };
  },
  "servers.finishDeviceCommand": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    const row = store
      .list("deviceCommands")
      .find((item) => item.serverId === server._id && item.commandId === args.commandId);
    if (row) store.delete(row._id);
    return null;
  },
  "servers.variables": (args, { store }) => {
    const server = resolveServer(store, typeof args.accessKey === "string" ? args.accessKey : undefined);
    checkScope(store, server._id, String(args.scope ?? ""));
    return store
      .list("environment")
      .filter((row) => row.serverId === server._id && row.scope === args.scope)
      .slice(0, 100)
      .map((row) => ({ name: row.name, updatedAt: row.updatedAt }));
  },
  "servers.setVariable": (args, { store }) => {
    const server = resolveServer(store, typeof args.accessKey === "string" ? args.accessKey : undefined);
    checkScope(store, server._id, String(args.scope ?? ""));
    validateVariableName(String(args.name ?? ""), args.scope === "server");
    const sealed = String(args.sealed ?? "");
    if (sealed.length < 100 || sealed.length > 30000) throw new Error("Invalid encrypted value.");
    const rows = store
      .list("environment")
      .filter((row) => row.serverId === server._id && row.scope === args.scope)
      .slice(0, 100);
    const old = rows.find((row) => row.name === args.name);
    if (old) store.patch(old._id, { sealed, updatedAt: Date.now() });
    else {
      if (rows.length >= 100) throw new Error("At most 100 variables per scope.");
      store.insert("environment", {
        serverId: server._id,
        scope: args.scope,
        name: args.name,
        sealed,
        updatedAt: Date.now(),
      });
    }
    return null;
  },
  "servers.removeVariable": (args, { store }) => {
    const server = resolveServer(store, typeof args.accessKey === "string" ? args.accessKey : undefined);
    checkScope(store, server._id, String(args.scope ?? ""));
    const row = store
      .list("environment")
      .find((item) => item.serverId === server._id && item.scope === args.scope && item.name === args.name);
    if (row) store.delete(row._id);
    return null;
  },
  "servers.readEnvironment": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    if (typeof args.projectId === "string") checkScope(store, server._id, args.projectId);
    const scopes = args.projectId ? ["server", String(args.projectId)] : ["server"];
    return store
      .list("environment")
      .filter((row) => row.serverId === server._id && scopes.includes(String(row.scope)))
      .map((row) => ({ name: row.name, sealed: row.sealed, scope: row.scope }));
  },
  "servers.importRepository": (args, { store }) => {
    const server = resolveServer(store, typeof args.accessKey === "string" ? args.accessKey : undefined);
    const repo = validateRepository(String(args.repo ?? "")).toLowerCase();
    const name = String(args.name ?? "");
    const sealedToken = String(args.sealedToken ?? "");
    if (!name.trim() || name.length > 200 || sealedToken.length < 100 || sealedToken.length > 30000) {
      throw new Error("Invalid import request.");
    }
    const existing = store
      .list("projects")
      .find((row) => row.serverId === server._id && row.githubRepo === repo);
    if (existing) throw new Error("This repository is already a Project on this worker.");
    const projectId = store.insert("projects", {
      name: name.trim(),
      githubRepo: repo,
      kind: args.kind,
      defaultRuntime: "local",
      localPath: "",
      serverId: server._id,
      cloneStatus: "queued",
    });
    store.insert("projectImports", {
      projectId,
      serverId: server._id,
      repo,
      sealedToken,
      status: "queued",
      leaseUntil: 0,
      attempt: 0,
    });
    return projectId;
  },
  "servers.retryImport": (args, { store }) => {
    const server = resolveServer(store, typeof args.accessKey === "string" ? args.accessKey : undefined);
    checkScope(store, server._id, String(args.projectId ?? ""));
    const row = store.list("projectImports").find((item) => item.projectId === args.projectId);
    const sealedToken = String(args.sealedToken ?? "");
    if (!row || row.status !== "failed" || sealedToken.length < 100 || sealedToken.length > 30000) {
      throw new Error("This import cannot be retried.");
    }
    store.patch(row._id, { status: "queued", sealedToken, leaseUntil: 0 });
    store.patch(String(args.projectId), { cloneStatus: "queued", cloneError: undefined });
    return null;
  },
  "servers.claimImport": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    const rows = store.list("projectImports").filter((row) => row.serverId === server._id);
    const active = rows.find((row) => row.status === "cloning");
    if (active && Number(active.leaseUntil) > Date.now()) return null;
    const row = active ?? rows.find((item) => item.status === "queued");
    if (!row) return null;
    if (!store.get(String(row.projectId))) {
      store.delete(row._id);
      return null;
    }
    const changes = { status: "cloning" as const, leaseUntil: Date.now() + 12 * 60_000, attempt: Number(row.attempt) + 1 };
    store.patch(row._id, changes);
    store.patch(String(row.projectId), { cloneStatus: "cloning", cloneError: undefined });
    return { ...row, ...changes };
  },
  "servers.finishImport": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    const row = store.get(String(args.importId ?? ""));
    if (!row || row.serverId !== server._id) throw new Error("Import not found.");
    if (row.status !== "cloning" || row.attempt !== args.attempt) return null;
    if (!args.error && !args.localPath) throw new Error("Clone path is required.");
    const status = args.error ? ("failed" as const) : ("ready" as const);
    store.patch(row._id, { status, sealedToken: undefined, leaseUntil: 0 });
    if (store.get(String(row.projectId))) {
      store.patch(String(row.projectId), {
        cloneStatus: status,
        cloneError: typeof args.error === "string" ? args.error.slice(0, 500) : undefined,
        ...(args.localPath ? { localPath: args.localPath } : {}),
      });
    }
    return null;
  },
  "terminals.list": (args, { store }) =>
    store.list("terminals").filter((row) => row.projectId === args.projectId).slice(0, 20),
  "terminals.output": (args, { store }) => {
    const io = store.list("terminalIO").find((row) => row.terminalId === args.id);
    return io ? { output: io.output, outputEnd: io.outputEnd } : null;
  },
  "terminals.create": (args, { store }) => {
    const project = requireProject(store, String(args.projectId ?? ""));
    const server = project.serverId ? store.get(String(project.serverId)) : resolveServer(store);
    if (!server || Date.now() - Number(server.lastSeen) > ONLINE_MS) {
      throw new Error("This machine is offline. Start the worker and retry.");
    }
    if (project.cloneStatus && project.cloneStatus !== "ready") {
      throw new Error("Wait for this Project to finish cloning.");
    }
    const tabs = store.list("terminals").filter((row) => row.projectId === args.projectId);
    if (tabs.length >= 20) {
      throw new Error("Close a terminal before opening another. Each Project can have 20 tabs.");
    }
    let number = 1;
    while (tabs.some((tab) => tab.title === `Terminal ${number}`)) number++;
    const id = store.insert("terminals", {
      projectId: args.projectId,
      serverId: server._id,
      title: `Terminal ${number}`,
      state: "queued",
      leaseUntil: 0,
      cols: 80,
      rows: 24,
    });
    store.insert("terminalIO", { terminalId: id, input: "", inputEnd: 0, output: "", outputEnd: 0 });
    return id;
  },
  "terminals.close": (args, { store }) => {
    const io = store.list("terminalIO").find((row) => row.terminalId === args.id);
    if (io) store.delete(io._id);
    if (store.get(String(args.id ?? ""))) store.delete(String(args.id));
    return null;
  },
  "terminals.input": (args, { store }) => {
    const tab = store.get(String(args.id ?? ""));
    if (!tab || tab.state !== "running" || Number(tab.leaseUntil) < Date.now()) {
      throw new Error("Terminal is disconnected. Input was not sent.");
    }
    const io = store.list("terminalIO").find((row) => row.terminalId === args.id);
    if (!io) throw new Error("Terminal was closed.");
    const data = String(args.data ?? "");
    if (String(io.input).length + data.length > 16_384) {
      throw new Error("Terminal input is full. Wait before pasting more text.");
    }
    store.patch(io._id, { input: String(io.input) + data, inputEnd: Number(io.inputEnd) + data.length });
    return null;
  },
  "terminals.resize": (args, { store }) => {
    const cols = Number(args.cols);
    const rows = Number(args.rows);
    terminalSize(cols, rows);
    const tab = store.get(String(args.id ?? ""));
    if (tab && (tab.cols !== cols || tab.rows !== rows)) store.patch(String(args.id), { cols, rows });
    return null;
  },
  "terminals.claim": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    const owner = String(args.owner ?? "");
    const all = store.list("terminals").filter((row) => row.serverId === server._id);
    const running = all.filter((row) => row.state === "running");
    for (const tab of running) {
      if (Number(tab.leaseUntil) < Date.now()) {
        store.patch(tab._id, {
          state: "exited",
          message: "Worker disconnected. Open a new terminal to start another shell.",
        });
      }
    }
    const queued = store.list("terminals").filter((row) => row.serverId === server._id && row.state === "queued");
    const result: Array<Doc & { localPath: string }> = [];
    for (const tab of queued) {
      const project = store.get(String(tab.projectId));
      if (!project || (project.serverId && project.serverId !== server._id)) {
        store.patch(tab._id, { state: "exited", message: "Project is unavailable on this machine." });
        continue;
      }
      store.patch(tab._id, { state: "running", owner, leaseUntil: Date.now() + 15_000 });
      result.push({ ...tab, localPath: String(project.localPath) });
    }
    for (const tab of store.list("terminals").filter((row) => row.serverId === server._id && row.state === "running")) {
      if (tab.owner !== owner || Number(tab.leaseUntil) < Date.now()) continue;
      const project = store.get(String(tab.projectId));
      if (project && (!project.serverId || project.serverId === server._id)) {
        result.push({ ...tab, localPath: String(project.localPath) });
      }
    }
    return result;
  },
  "terminals.exchange": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    const tab = store.get(String(args.id ?? ""));
    if (
      !tab ||
      tab.serverId !== server._id ||
      tab.owner !== args.owner ||
      tab.state !== "running" ||
      Number(tab.leaseUntil) < Date.now()
    ) {
      return null;
    }
    const io = store.list("terminalIO").find((row) => row.terminalId === args.id);
    if (!io) return null;
    const inputAck = Number(args.inputAck);
    const outputEnd = Number(args.outputEnd);
    const output = String(args.output ?? "");
    if (
      !Number.isSafeInteger(inputAck) ||
      inputAck < 0 ||
      inputAck > Number(io.inputEnd) ||
      !Number.isSafeInteger(outputEnd) ||
      outputEnd < output.length ||
      output.length > 65_536
    ) {
      throw new Error("Invalid terminal stream offset.");
    }
    const input = String(io.input).slice(Math.max(0, inputAck - (Number(io.inputEnd) - String(io.input).length)));
    if (input !== io.input || outputEnd > Number(io.outputEnd)) {
      store.patch(io._id, {
        input,
        ...(outputEnd > Number(io.outputEnd) ? { output, outputEnd } : {}),
      });
    }
    if (args.exit !== undefined) store.patch(tab._id, { state: "exited", message: String(args.exit).slice(0, 1000) });
    else if (Number(tab.leaseUntil) < Date.now() + 10_000) store.patch(tab._id, { leaseUntil: Date.now() + 15_000 });
    return { input, inputEnd: io.inputEnd, cols: tab.cols, rows: tab.rows };
  },
  "projectOperations.list": (args, { store }) =>
    store
      .list("projectOperations")
      .filter((row) => row.projectId === args.projectId)
      .slice(0, 50),
  "projectOperations.enqueue": (args, { store }) => {
    const project = requireProject(store, String(args.projectId ?? ""));
    const server = project.serverId ? store.get(String(project.serverId)) : resolveServer(store);
    if (!server || Date.now() - Number(server.lastSeen) > ONLINE_MS) {
      throw new Error("This machine is offline. Start the worker and retry.");
    }
    if (project.cloneStatus && project.cloneStatus !== "ready") {
      throw new Error("Wait for this Project to finish cloning.");
    }
    const operation = asRecord(args.operation) as ProjectOperation;
    if (operation.kind === "terminal" && (!operation.command.trim() || operation.command.length > 8000)) {
      throw new Error("Enter a command of up to 8,000 characters.");
    }
    if (
      operation.kind === "commit" &&
      (!operation.message.trim() || operation.message.length > 2000 || !operation.paths.length || operation.paths.length > 500)
    ) {
      throw new Error("Select files and enter a commit message.");
    }
    if (operation.kind === "checkout" && (!operation.branch.trim() || operation.branch.length > 255)) {
      throw new Error("Enter a branch name.");
    }
    if (operation.kind === "createBranch" && (!operation.name.trim() || operation.name.length > 255)) {
      throw new Error("Enter a branch name.");
    }
    if (
      operation.kind === "createWorktree" &&
      (!operation.name.trim() || operation.name.length > 80 || !operation.branch.trim() || operation.branch.length > 255)
    ) {
      throw new Error("Enter a worktree name and branch.");
    }
    if (operation.kind === "removeWorktree" && (!operation.path.trim() || operation.path.length > 1024)) {
      throw new Error("Choose a worktree to remove.");
    }
    const recent = store.list("projectOperations").filter((row) => row.projectId === args.projectId);
    const active = recent.filter((row) => row.state === "queued" || row.state === "running");
    if (operation.kind === "status") {
      const existing = active.find((row) => asRecord(row.operation).kind === "status");
      if (existing) return existing._id;
    }
    if (active.length >= 10) throw new Error("Wait for the pending commands to finish.");
    const blocksAgent =
      operation.kind === "commit" ||
      operation.kind === "checkout" ||
      operation.kind === "pull" ||
      (operation.kind === "createBranch" && operation.checkout);
    if (blocksAgent) {
      const sessions = store.list("sessions").filter((row) => row.projectId === args.projectId);
      if (sessions.some((session) => session.status === "running" || session.status === "queued")) {
        if (operation.kind === "commit") throw new Error("Stop the agent before committing its changes.");
        if (operation.kind === "pull") throw new Error("Stop the agent before pulling.");
        throw new Error("Stop the agent before switching branches.");
      }
    }
    const keep: Record<ProjectOperation["kind"], number> = {
      status: 2,
      diff: 5,
      terminal: 20,
      commit: 10,
      checkout: 8,
      createBranch: 8,
      createWorktree: 8,
      removeWorktree: 8,
      fetch: 5,
      pull: 5,
      push: 5,
    };
    for (const row of recent) {
      if (row.state === "queued" || row.state === "running") continue;
      const kind = asRecord(row.operation).kind as ProjectOperation["kind"];
      if (keep[kind]-- <= 0) store.delete(row._id);
    }
    return store.insert("projectOperations", {
      projectId: args.projectId,
      serverId: server._id,
      operation,
      state: "queued" satisfies OperationState,
      output: "",
    });
  },
  "projectOperations.cancel": (args, { store }) => {
    const row = store.get(String(args.id ?? ""));
    if (row && (row.state === "queued" || row.state === "running")) store.patch(row._id, { state: "cancelled" });
    return null;
  },
  "projectOperations.claim": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    const rows = store.list("projectOperations").filter((row) => row.serverId === server._id);
    const running = rows.filter((row) => row.state === "running");
    for (const row of running) {
      if (Date.now() - Number(row.startedAt ?? 0) > 180_000) {
        store.patch(row._id, {
          state: "failed",
          error: "Worker disconnected or command timed out. Check the result before retrying.",
        });
      }
    }
    const queued = store.list("projectOperations").filter((row) => row.serverId === server._id && row.state === "queued");
    for (const item of queued) {
      if (Date.now() - item._creationTime > 180_000) {
        store.patch(item._id, {
          state: "failed",
          error: "Command expired while waiting for the worker. Retry when this machine is online.",
        });
      }
    }
    const liveRunning = store.list("projectOperations").filter((row) => row.serverId === server._id && row.state === "running");
    const row = store
      .list("projectOperations")
      .filter((item) => item.serverId === server._id && item.state === "queued")
      .find(
        (item) =>
          Date.now() - item._creationTime <= 180_000 &&
          !liveRunning.some((active) => active.projectId === item.projectId),
      );
    if (!row) return null;
    const project = store.get(String(row.projectId));
    if (!project || (project.serverId && project.serverId !== server._id)) {
      store.patch(row._id, { state: "failed", error: "Project is unavailable on this machine." });
      return null;
    }
    store.patch(row._id, { state: "running", startedAt: Date.now() });
    return { ...row, localPath: project.localPath };
  },
  "projectOperations.update": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    const row = store.get(String(args.id ?? ""));
    if (!row || row.serverId !== server._id) throw new Error("Unknown command.");
    if (row.state !== "running") return false;
    store.patch(row._id, {
      output: String(args.output ?? "").slice(-100_000),
      ...(args.result ? { result: args.result as OperationResult, state: "done" as const } : {}),
      ...(args.error ? { error: String(args.error).slice(0, 2000), state: "failed" as const } : {}),
    });
    return true;
  },
  "github.connection": (_args, { store }) => {
    const row = store.list("githubConnection")[0];
    return row ? { login: row.login, token: row.token } : null;
  },
  "github.save": (args, { store }) => {
    const next = requireConnection(String(args.login ?? ""), String(args.token ?? ""));
    const rows = store.list("githubConnection");
    if (rows[0]) {
      store.patch(rows[0]._id, next);
      for (const extra of rows.slice(1)) store.delete(extra._id);
    } else {
      store.insert("githubConnection", next);
    }
    return null;
  },
  "github.disconnect": (_args, { store }) => {
    for (const row of store.list("githubConnection")) store.delete(row._id);
    return null;
  },
  "github.begin": async (args) => {
    const data = await deviceRequest("device/code", { client_id: githubClient(String(args.clientId ?? "")) });
    if (
      typeof data.device_code !== "string" ||
      typeof data.user_code !== "string" ||
      typeof data.expires_in !== "number" ||
      typeof data.interval !== "number"
    ) {
      throw new Error(
        "Unable to start GitHub sign-in. Check the client ID and enable Device Flow in your GitHub App settings.",
      );
    }
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      expiresIn: data.expires_in,
      interval: data.interval,
    };
  },
  "github.poll": async (args) => {
    const deviceCode = String(args.deviceCode ?? "");
    if (!deviceCode || deviceCode.length > 256) throw new Error("Invalid device code.");
    const data = await deviceRequest("oauth/access_token", {
      client_id: githubClient(String(args.clientId ?? "")),
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (typeof data.access_token === "string") return { status: "connected" as const, token: data.access_token };
    if (data.error === "authorization_pending") return { status: "pending" as const };
    if (data.error === "slow_down") return { status: "slow_down" as const };
    if (data.error === "access_denied") throw new Error("GitHub sign-in was declined.");
    if (data.error === "expired_token") throw new Error("The code expired. Start GitHub sign-in again.");
    throw new Error("GitHub sign-in failed. Check your App settings and try again.");
  },
  "pty.issueTicket": (args, { store }) => {
    const project = requireProject(store, String(args.projectId ?? ""));
    const server = project.serverId ? store.get(String(project.serverId)) : resolveServer(store);
    if (!server || Date.now() - Number(server.lastSeen) > ONLINE_MS) {
      throw new Error("This machine is offline. Start the worker and retry.");
    }
    const pty = asRecord(server.pty);
    if (typeof pty.url !== "string") throw new Error("Terminal is not available on this worker.");
    const ticket = randomToken();
    const expiresAt = Date.now() + TICKET_TTL_MS;
    store.insert("ptyTickets", { token: ticket, projectId: project._id, serverId: server._id, expiresAt });
    return { wsUrl: pty.url, ticket, expiresAt, hostOs: pty.os };
  },
  "pty.validateTicket": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    const row = store.list("ptyTickets").find((item) => item.token === args.ticket);
    if (!row || row.serverId !== server._id) throw new Error("Invalid ticket.");
    if (Number(row.expiresAt) <= Date.now()) throw new Error("Terminal ticket expired.");
    const project = requireProject(store, String(row.projectId));
    return { projectId: project._id, cwd: project.localPath };
  },
  "pty.reportPty": (args, { store }) => {
    const server = requireServer(store, String(args.accessKey ?? ""));
    store.patch(server._id, {
      pty: { url: args.url, os: args.os, checkedAt: Date.now() },
      lastSeen: Date.now(),
    });
    return null;
  },
  "skills.list": (_args, { store }) => store.list("skills").slice(0, 250),
  "skills.catalog": (_args, { store }) =>
    store.list("skills").slice(0, 250).map((skill) => ({
      _id: skill._id,
      slug: skill.slug,
      title: skill.title,
      description: skillBlurb({
        title: String(skill.title),
        body: String(skill.body ?? ""),
        description: typeof skill.description === "string" ? skill.description : undefined,
      }),
    })),
  "skills.create": (args, { store }) => {
    const existing = store.list("skills").find((row) => row.slug === args.slug);
    if (existing) throw new Error(`A skill with the slug “${String(args.slug)}” already exists`);
    return store.insert("skills", { ...args, importedAt: Date.now() });
  },
  "skills.get": (args, { store }) => store.get(String(args.skillId ?? "")),
  "skills.update": (args, { store }) => {
    const skill = store.get(String(args.skillId ?? ""));
    if (!skill) throw new Error("Skill not found");
    store.patch(skill._id, { title: args.title, body: args.body });
    return null;
  },
  "seed.ensure": (args, { store }) => {
    let createdSkills = 0;
    const skills = Array.isArray(args.skills) ? args.skills : [];
    for (const skill of skills) {
      const row = asRecord(skill);
      const existing = store.list("skills").find((item) => item.slug === row.slug);
      if (existing) continue;
      store.insert("skills", row);
      createdSkills += 1;
    }
    return { createdSkills };
  },
  "seed.featureReady": () => true,
};

export async function dispatch(
  kind: DispatchKind,
  pathName: string,
  args: Record<string, unknown>,
  ctx: DispatchCtx,
): Promise<unknown> {
  const handler = handlers[pathName];
  if (!handler) throw new Error(`Unknown ${kind} ${pathName}`);
  return await handler(args, ctx);
}

export function saveUpload(uploads: string, bytes: Uint8Array): string {
  mkdirSync(uploads, { recursive: true, mode: 0o700 });
  const id = `storage_${crypto.randomUUID().replaceAll("-", "")}`;
  writeFileSync(path.join(uploads, id), bytes);
  return id;
}
