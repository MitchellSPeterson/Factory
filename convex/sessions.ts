import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireProject, requireSession } from "./lib/docs";
import { requireProjectServer } from "./lib/servers";
import {
  agentEffort,
  sessionMessageRole,
  sessionProvider,
  sessionStatus,
  tokenUsage,
} from "./lib/validators";
import { addUsage, isZeroUsage, subUsage, ZERO_USAGE } from "./lib/tokenUsage";
import { v } from "convex/values";

export const MAX_SESSION_MESSAGE = 16000;
export const MAX_SESSION_IMAGES = 4;
const MAX_SESSION_TITLE = 72;

const sessionDoc = v.object({
  _id: v.id("sessions"),
  _creationTime: v.number(),
  projectId: v.id("projects"),
  title: v.string(),
  provider: sessionProvider,
  model: v.string(),
  effort: agentEffort,
  status: sessionStatus,
  agentId: v.optional(v.string()),
  error: v.optional(v.string()),
  usage: v.optional(tokenUsage),
  durationMs: v.optional(v.number()),
  turnStartedAt: v.optional(v.number()),
});

const messageDoc = v.object({
  _id: v.id("sessionMessages"),
  _creationTime: v.number(),
  sessionId: v.id("sessions"),
  role: sessionMessageRole,
  text: v.string(),
  imageIds: v.optional(v.array(v.id("_storage"))),
  imageUrls: v.array(v.union(v.string(), v.null())),
  createdAt: v.number(),
});

const projectSummary = v.object({
  _id: v.id("projects"),
  name: v.string(),
  kind: v.union(v.literal("expo"), v.literal("web"), v.literal("mixed")),
  localPath: v.string(),
  githubRepo: v.string(),
});

const sessionLaunch = v.object({
  sessionId: v.id("sessions"),
  prompt: v.string(),
  provider: sessionProvider,
  model: v.string(),
  effort: agentEffort,
  agentId: v.optional(v.string()),
  images: v.array(v.object({ url: v.string() })),
  project: v.object({
    id: v.id("projects"),
    serverId: v.optional(v.id("servers")),
    name: v.string(),
    kind: v.union(v.literal("expo"), v.literal("web"), v.literal("mixed")),
    localPath: v.string(),
    githubRepo: v.string(),
  }),
});

export function titleFrom(text: string, imageCount = 0): string {
  const one = text.trim().replace(/\s+/g, " ");
  if (one === "") return imageCount > 0 ? "Image" : "New session";
  if (one.length <= MAX_SESSION_TITLE) return one;
  return `${one.slice(0, MAX_SESSION_TITLE - 1).trimEnd()}…`;
}

function requireMessageText(text: string, imageCount = 0): string {
  const trimmed = text.trim();
  if (trimmed === "" && imageCount === 0) throw new Error("Message is required");
  if (trimmed.length > MAX_SESSION_MESSAGE) {
    throw new Error(`A message can be at most ${MAX_SESSION_MESSAGE} characters`);
  }
  return trimmed;
}

function requireImageIds(ids: Id<"_storage">[] | undefined): Id<"_storage">[] {
  const imageIds = ids ?? [];
  if (imageIds.length > MAX_SESSION_IMAGES) {
    throw new Error(`A message can have at most ${MAX_SESSION_IMAGES} images`);
  }
  return imageIds;
}

async function urlsFor(ctx: MutationCtx | QueryCtx, ids: Id<"_storage">[] | undefined) {
  const urls = [];
  for (const id of ids ?? []) urls.push(await ctx.storage.getUrl(id));
  return urls;
}

function busy(status: Doc<"sessions">["status"]): boolean {
  return status === "queued" || status === "running";
}

async function closeTurn(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  status: Doc<"sessions">["status"],
  error?: string,
) {
  const extra =
    session.turnStartedAt !== undefined ? Math.max(0, Date.now() - session.turnStartedAt) : 0;
  await ctx.db.patch(session._id, {
    status,
    error,
    turnStartedAt: undefined,
    durationMs: (session.durationMs ?? 0) + extra,
  });
}

export const list = query({
  args: {},
  returns: v.array(
    v.object({
      session: sessionDoc,
      projectName: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const sessions = await ctx.db.query("sessions").order("desc").collect();
    const rows = [];
    for (const session of sessions) {
      const project = await ctx.db.get(session.projectId);
      rows.push({ session, projectName: project?.name ?? "missing" });
    }
    return rows;
  },
});

export const get = query({
  args: { sessionId: v.id("sessions") },
  returns: v.union(
    v.object({
      session: sessionDoc,
      project: projectSummary,
      messages: v.array(messageDoc),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    const project = await ctx.db.get(session.projectId);
    if (!project) return null;
    const messages = await ctx.db
      .query("sessionMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    messages.sort((a, b) => a.createdAt - b.createdAt);
    const withUrls = [];
    for (const message of messages) {
      withUrls.push({
        ...message,
        imageUrls: await urlsFor(ctx, message.imageIds),
      });
    }
    return {
      session,
      project: {
        _id: project._id,
        name: project.name,
        kind: project.kind,
        localPath: project.localPath,
        githubRepo: project.githubRepo,
      },
      messages: withUrls,
    };
  },
});

export const create = mutation({
  args: {
    projectId: v.id("projects"),
    accessKey: v.optional(v.string()),
    provider: sessionProvider,
    model: v.string(),
    effort: agentEffort,
    text: v.string(),
    imageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.id("sessions"),
  handler: async (ctx, args) => {
    const imageIds = requireImageIds(args.imageIds);
    const text = requireMessageText(args.text, imageIds.length);
    if (args.model.trim() === "") throw new Error("Model is required");
    const project = await requireProject(ctx, args.projectId);
    await requireProjectServer(ctx, project, args.accessKey);
    if (project.serverId && project.cloneStatus !== "ready") {
      throw new Error("Wait for the Project to finish cloning before starting a Session.");
    }
    const sessionId = await ctx.db.insert("sessions", {
      projectId: project._id,
      title: titleFrom(text, imageIds.length),
      provider: args.provider,
      model: args.model.trim(),
      effort: args.effort,
      status: "queued",
    });
    await ctx.db.insert("sessionMessages", {
      sessionId,
      role: "user",
      text,
      imageIds: imageIds.length > 0 ? imageIds : undefined,
      createdAt: Date.now(),
    });
    return sessionId;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const configure = mutation({
  args: {
    sessionId: v.id("sessions"),
    provider: sessionProvider,
    model: v.string(),
    effort: agentEffort,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await requireSession(ctx, args.sessionId);
    if (busy(session.status)) throw new Error("Wait for the current turn to finish.");
    if (args.model.trim() === "") throw new Error("Model is required");
    const providerChanged = args.provider !== session.provider;
    await ctx.db.patch(session._id, {
      provider: args.provider,
      model: args.model.trim(),
      effort: args.effort,
      ...(providerChanged ? { agentId: undefined } : {}),
    });
    return null;
  },
});

export const send = mutation({
  args: {
    sessionId: v.id("sessions"),
    text: v.string(),
    imageIds: v.optional(v.array(v.id("_storage"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await requireSession(ctx, args.sessionId);
    if (busy(session.status)) throw new Error("Wait for the current turn to finish.");
    const imageIds = requireImageIds(args.imageIds);
    const text = requireMessageText(args.text, imageIds.length);
    await ctx.db.insert("sessionMessages", {
      sessionId: session._id,
      role: "user",
      text,
      imageIds: imageIds.length > 0 ? imageIds : undefined,
      createdAt: Date.now(),
    });
    await ctx.db.patch(session._id, {
      status: "queued",
      error: undefined,
      title: session.title === "New session" ? titleFrom(text, imageIds.length) : session.title,
    });
    return null;
  },
});

export const stop = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await requireSession(ctx, args.sessionId);
    if (!busy(session.status)) return null;
    await closeTurn(ctx, session, "stopped");
    return null;
  },
});

export const remove = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await requireSession(ctx, args.sessionId);
    const messages = await ctx.db
      .query("sessionMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    for (const message of messages) {
      for (const imageId of message.imageIds ?? []) await ctx.storage.delete(imageId);
      await ctx.db.delete(message._id);
    }
    await ctx.db.delete(session._id);
    return null;
  },
});

export const listQueued = query({
  args: {},
  returns: v.array(v.id("sessions")),
  handler: async (ctx) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();
    return sessions.map((session) => session._id);
  },
});

export const claim = mutation({
  args: { sessionId: v.id("sessions"), accessKey: v.optional(v.string()) },
  returns: v.union(sessionLaunch, v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status !== "queued") return null;
    const project = await requireProject(ctx, session.projectId);
    if (project.serverId) {
      if (!args.accessKey) return null;
      try {
        await requireProjectServer(ctx, project, args.accessKey);
      } catch {
        return null;
      }
      if (project.cloneStatus !== "ready") return null;
    }
    const lastUser = await ctx.db
      .query("sessionMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .order("desc")
      .first();
    if (!lastUser || lastUser.role !== "user") {
      await ctx.db.patch(session._id, { status: "failed", error: "Session has no user message." });
      return null;
    }
    await ctx.db.patch(session._id, { status: "running", turnStartedAt: Date.now(), error: undefined });
    const imageUrls = await urlsFor(ctx, lastUser.imageIds);
    return {
      sessionId: session._id,
      prompt: lastUser.text,
      provider: session.provider,
      model: session.model,
      effort: session.effort,
      agentId: session.agentId,
      images: imageUrls.flatMap((url) => (url ? [{ url }] : [])),
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
});

export const bindAgent = mutation({
  args: { sessionId: v.id("sessions"), agentId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireSession(ctx, args.sessionId);
    await ctx.db.patch(args.sessionId, { agentId: args.agentId });
    return null;
  },
});

export const appendMessage = mutation({
  args: { sessionId: v.id("sessions"), text: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await requireSession(ctx, args.sessionId);
    if (args.text === "") return null;
    const last = await ctx.db
      .query("sessionMessages")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .order("desc")
      .first();
    if (last?.role === "assistant") {
      await ctx.db.patch(last._id, { text: last.text + args.text });
      return null;
    }
    await ctx.db.insert("sessionMessages", {
      sessionId: session._id,
      role: "assistant",
      text: args.text,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const recordUsage = mutation({
  args: { sessionId: v.id("sessions"), usage: tokenUsage },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await requireSession(ctx, args.sessionId);
    const next = args.usage;
    const prev = session.usage ?? ZERO_USAGE;
    const delta = subUsage(next, prev);
    if (isZeroUsage(delta) && session.usage) return null;
    await ctx.db.patch(session._id, { usage: next });
    if (isZeroUsage(delta)) return null;
    const project = await requireProject(ctx, session.projectId);
    await ctx.db.patch(project._id, { usage: addUsage(project.usage ?? ZERO_USAGE, delta) });
    return null;
  },
});

export const complete = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await requireSession(ctx, args.sessionId);
    if (session.status !== "running") return null;
    await closeTurn(ctx, session, "idle");
    return null;
  },
});

export const fail = mutation({
  args: { sessionId: v.id("sessions"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await requireSession(ctx, args.sessionId);
    if (session.status === "stopped") return null;
    await closeTurn(ctx, session, "failed", args.error);
    return null;
  },
});

export const getStatus = query({
  args: { sessionId: v.id("sessions") },
  returns: v.union(sessionStatus, v.null()),
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    return session?.status ?? null;
  },
});
