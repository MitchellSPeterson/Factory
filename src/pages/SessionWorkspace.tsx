import { useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useId, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  AGENT_EFFORTS,
  CODEX_MODELS,
  GROK_MODELS,
  providerLabel,
} from "../../convex/lib/agentModel";
import { ContextMeter } from "../ContextViewer";
import { modelContextWindow } from "../contextSegments";
import { useProjectScope } from "../projectScope";
import { useServer } from "../servers/connection";

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

type DraftImage = { key: string; file: File; preview: string };

const COMPOSER_KEY = "factory-session-composer";

type Provider = "grok" | "codex";
type Effort = (typeof AGENT_EFFORTS)[number];

function renderableLog(text: string): string {
  const fences = (text.match(/^```/gm) ?? []).length;
  return fences % 2 === 1 ? `${text}\n\`\`\`` : text;
}

function readComposer(): { provider: Provider; model: string; effort: Effort } {
  try {
    const raw = localStorage.getItem(COMPOSER_KEY);
    if (!raw) return { provider: "grok", model: GROK_MODELS[0], effort: "medium" };
    const parsed = JSON.parse(raw) as { provider?: string; model?: string; effort?: string };
    const provider: Provider = parsed.provider === "codex" ? "codex" : "grok";
    const effort = AGENT_EFFORTS.includes(parsed.effort as Effort) ? (parsed.effort as Effort) : "medium";
    const models = provider === "codex" ? CODEX_MODELS : GROK_MODELS;
    const model = parsed.model && parsed.model.trim() !== "" ? parsed.model : models[0];
    return { provider, model, effort };
  } catch {
    return { provider: "grok", model: GROK_MODELS[0], effort: "medium" };
  }
}

function writeComposer(value: { provider: Provider; model: string; effort: Effort }) {
  try {
    localStorage.setItem(COMPOSER_KEY, JSON.stringify(value));
  } catch {
    // private browsing
  }
}

function modelsFor(provider: Provider) {
  return provider === "codex" ? CODEX_MODELS : GROK_MODELS;
}

function isListedModel(provider: Provider, model: string) {
  return modelsFor(provider).some((item) => item === model);
}

function isImageFile(file: File) {
  return IMAGE_TYPES.includes(file.type) || /\.(png|jpe?g|gif|webp)$/i.test(file.name);
}

export function SessionWorkspace() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const id = sessionId as Id<"sessions"> | undefined;
  const navigate = useNavigate();
  const sessions = useQuery(api.sessions.list);
  const view = useQuery(api.sessions.get, id ? { sessionId: id } : "skip");
  const projects = useQuery(api.projects.list);
  const create = useMutation(api.sessions.create);
  const send = useMutation(api.sessions.send);
  const stop = useMutation(api.sessions.stop);
  const remove = useMutation(api.sessions.remove);
  const configure = useMutation(api.sessions.configure);
  const generateUploadUrl = useMutation(api.sessions.generateUploadUrl);
  const { projectId: scopedProjectId } = useProjectScope();
  const { accessKey } = useServer();
  const saved = readComposer();
  const [projectId, setProjectId] = useState(scopedProjectId);
  const [provider, setProvider] = useState<Provider>(saved.provider);
  const [model, setModel] = useState(saved.model);
  const [effort, setEffort] = useState<Effort>(saved.effort);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [images, setImages] = useState<DraftImage[]>([]);
  const historyTitleId = useId();
  const modelPickerId = useId();
  const threadRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  const active = id && view ? view.session : null;
  const live = active?.status === "queued" || active?.status === "running";
  const canSend = !active || active.status === "idle" || active.status === "failed" || active.status === "stopped";
  const visible = (sessions ?? []).filter(
    (row) => scopedProjectId === "" || row.session.projectId === scopedProjectId,
  );
  const models = modelsFor(provider);
  const selectedProject = projects?.find((project) => project._id === (projectId || scopedProjectId));
  const empty = !id;

  useEffect(() => {
    setProjectId(scopedProjectId);
  }, [scopedProjectId]);

  useEffect(() => {
    if (!active) return;
    setProvider(active.provider);
    setModel(active.model);
    setEffort(active.effort);
  }, [active?._id, active?.provider, active?.model, active?.effort]);

  useEffect(() => {
    writeComposer({ provider, model, effort });
  }, [provider, model, effort]);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [view?.messages, live]);

  useEffect(() => {
    const node = textareaRef.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [draft]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [id]);

  useEffect(() => {
    if (!historyOpen && !modelPickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setHistoryOpen(false);
      setModelPickerOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!modelPickerOpen || modelPickerRef.current?.contains(event.target as Node)) return;
      setModelPickerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [historyOpen, modelPickerOpen]);

  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => {
    return () => {
      for (const image of imagesRef.current) URL.revokeObjectURL(image.preview);
    };
  }, []);

  function changeProvider(next: Provider) {
    setProvider(next);
    if (!isListedModel(next, model)) setModel(modelsFor(next)[0]);
  }

  function addFiles(list: FileList | File[]) {
    const incoming = [...list].filter(isImageFile);
    if (incoming.length === 0) return;
    setError("");
    setImages((current) => {
      const next = [...current];
      for (const file of incoming) {
        if (next.length >= MAX_IMAGES) {
          setError(`A message can have at most ${MAX_IMAGES} images`);
          break;
        }
        if (file.size > MAX_IMAGE_BYTES) {
          setError("Images must be 8 MB or smaller.");
          continue;
        }
        next.push({ key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file, preview: URL.createObjectURL(file) });
      }
      return next;
    });
  }

  function removeImage(key: string) {
    setImages((current) => {
      const hit = current.find((image) => image.key === key);
      if (hit) URL.revokeObjectURL(hit.preview);
      return current.filter((image) => image.key !== key);
    });
  }

  async function uploadImages(): Promise<Id<"_storage">[]> {
    const ids: Id<"_storage">[] = [];
    for (const image of images) {
      const uploadUrl = await generateUploadUrl();
      const posted = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": image.file.type || "application/octet-stream" },
        body: image.file,
      });
      if (!posted.ok) throw new Error("Could not upload an image.");
      const body = await posted.json() as { storageId?: Id<"_storage"> };
      if (!body.storageId) throw new Error("Could not upload an image.");
      ids.push(body.storageId);
    }
    return ids;
  }

  function clearImages() {
    for (const image of images) URL.revokeObjectURL(image.preview);
    setImages([]);
  }

  async function applyConfigure(next: { provider: Provider; model: string; effort: Effort }) {
    if (!id || !active || live) return;
    if (next.provider === active.provider && next.model === active.model && next.effort === active.effort) return;
    try {
      await configure({ sessionId: id, ...next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the Session.");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if ((text === "" && images.length === 0) || busy) return;
    setError("");
    if (!id) {
      const nextProjectId = projectId || scopedProjectId;
      if (nextProjectId === "") {
        setError("Choose a Project first.");
        return;
      }
      setBusy(true);
      try {
        const imageIds = await uploadImages();
        const created = await create({
          projectId: nextProjectId,
          accessKey: accessKey || undefined,
          provider,
          model,
          effort,
          text,
          imageIds: imageIds.length > 0 ? imageIds : undefined,
        });
        setDraft("");
        clearImages();
        navigate(`/sessions/${created}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send.");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!canSend) return;
    setBusy(true);
    try {
      const imageIds = await uploadImages();
      await send({ sessionId: id, text, imageIds: imageIds.length > 0 ? imageIds : undefined });
      setDraft("");
      clearImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send.");
    } finally {
      setBusy(false);
    }
  }

  const messages = view?.messages ?? [];
  const last = messages.at(-1);
  const waiting = active?.status === "queued";
  const showPlaceholder = live && last?.role !== "assistant";

  return (
    <div className="session-shell">
      {historyOpen ? (
        <div className="session-modal-backdrop" role="presentation" onMouseDown={() => setHistoryOpen(false)}>
          <section
            className="session-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={historyTitleId}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="session-modal-head">
              <div>
                <h2 id={historyTitleId}>Sessions</h2>
                <p>{scopedProjectId === "" ? "All conversations" : selectedProject?.name ?? "This Project"}</p>
              </div>
              <button type="button" className="icon-button" aria-label="Close Sessions" onClick={() => setHistoryOpen(false)}>×</button>
            </header>
            <nav className="session-history-list">
              {sessions === undefined ? (
                <p className="muted session-history-empty">Loading…</p>
              ) : visible.length === 0 ? (
                <div className="session-history-empty">
                  <strong>No Sessions yet</strong>
                  <span>Start one from the composer.</span>
                </div>
              ) : (
                visible.map((row) => (
                  <NavLink
                    key={row.session._id}
                    to={`/sessions/${row.session._id}`}
                    className={({ isActive }) => `session-history-item${isActive ? " active" : ""}`}
                    onClick={() => setHistoryOpen(false)}
                  >
                    <i className={`session-dot ${row.session.status}`} aria-hidden="true" />
                    <span>{row.session.title}</span>
                    <small>{row.projectName}</small>
                  </NavLink>
                ))
              )}
            </nav>
          </section>
        </div>
      ) : null}
      <div className={`session-board${empty ? " empty" : ""}`}>
        <header className="session-top">
          <div className="session-top-copy">
            <strong>{active?.title ?? "New session"}</strong>
            <span>
              {view?.project.name ?? selectedProject?.name ?? (scopedProjectId === "" ? "Choose a Project" : "This Project")}
              {active ? ` · ${providerLabel(active.provider)}` : ""}
            </span>
          </div>
          <div className="session-top-actions">
            {live ? (
              <button type="button" className="ghost" disabled={busy} onClick={() => id && void stop({ sessionId: id })}>
                Stop
              </button>
            ) : null}
            {id && view ? (
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={async () => {
                  if (!window.confirm("Delete this Session and its transcript?")) return;
                  setBusy(true);
                  try {
                    await remove({ sessionId: id });
                    navigate("/sessions");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not delete Session.");
                    setBusy(false);
                  }
                }}
              >
                Delete
              </button>
            ) : null}
          </div>
        </header>
        {id && view === undefined ? (
          <div className="session-thread" aria-busy="true">
            <div className="session-skel" />
            <div className="session-skel short" />
          </div>
        ) : id && view === null ? (
          <div className="session-empty">
            <h1>Session not found</h1>
            <p>That Session is gone, or the link is wrong.</p>
            <Link to="/sessions">Start a new session</Link>
          </div>
        ) : empty ? (
          <div className="session-empty">
            <h1>What are we working on?</h1>
            <p>Grok Build or Codex, in this Project.</p>
          </div>
        ) : (
          <div className="session-thread" ref={threadRef}>
            {active?.error ? <p className="job-error">{active.error}</p> : null}
            {messages.map((message) => {
              const liveMessage = live && message.role === "assistant" && message === last;
              return (
                <article className={`session-turn ${message.role}`} key={message._id}>
                  {message.role === "assistant" ? (
                    <div className="session-mark" aria-hidden="true">
                      {active?.provider === "codex" ? "C" : "G"}
                    </div>
                  ) : null}
                  <div className={`session-copy${message.role === "assistant" ? " markdown" : ""}${liveMessage ? " live" : ""}`}>
                    {message.role === "assistant" ? (
                      message.text !== "" ? <Markdown>{renderableLog(message.text)}</Markdown> : <p className="muted">{waiting ? "Waiting for this machine…" : "Working…"}</p>
                    ) : (
                      <>
                        {message.imageUrls.length > 0 ? (
                          <div className="session-thumbs">
                            {message.imageUrls.map((url, index) =>
                              url ? <img key={`${message._id}-${index}`} src={url} alt="" /> : null,
                            )}
                          </div>
                        ) : null}
                        {message.text !== "" ? <p>{message.text}</p> : null}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
            {showPlaceholder ? (
              <article className="session-turn assistant">
                <div className="session-mark" aria-hidden="true">{active?.provider === "codex" ? "C" : "G"}</div>
                <div className="session-copy markdown live">
                  <p className="muted">{waiting ? "Waiting for this machine…" : "Working…"}</p>
                </div>
              </article>
            ) : null}
          </div>
        )}
        <form
          className="session-composer"
          onSubmit={(event) => void onSubmit(event)}
          onDragOver={(event) => { event.preventDefault(); }}
          onDrop={(event) => {
            event.preventDefault();
            if (!live && !busy) addFiles(event.dataTransfer.files);
          }}
        >
          {error ? <p role="alert">{error}</p> : null}
          <div className="session-composer-box">
            {images.length > 0 ? (
              <div className="session-draft-thumbs">
                {images.map((image) => (
                  <span className="session-draft-thumb" key={image.key}>
                    <img src={image.preview} alt="" />
                    <button type="button" aria-label="Remove image" onClick={() => removeImage(image.key)}>×</button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="session-composer-input">
              <textarea
                ref={textareaRef}
                value={draft}
                rows={1}
                onChange={(event) => setDraft(event.target.value)}
                onPaste={(event) => {
                  const files = [...event.clipboardData.files].filter(isImageFile);
                  if (files.length === 0) return;
                  event.preventDefault();
                  addFiles(files);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
                placeholder={live ? "Waiting for this turn to finish…" : empty ? "Message Grok Build or Codex" : "Send a follow-up"}
                disabled={live || busy}
                aria-label="Message"
              />
              {live ? (
                <button type="button" className="session-send stop" aria-label="Stop" onClick={() => id && void stop({ sessionId: id })}>
                  <IconStop />
                </button>
              ) : (
                <button
                  type="submit"
                  className="session-send"
                  aria-label="Send"
                  disabled={busy || (draft.trim() === "" && images.length === 0) || (!id && (projectId || scopedProjectId) === "")}
                >
                  <IconSend />
                </button>
              )}
            </div>
            <div className="session-picks">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                hidden
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                className="session-attach"
                aria-label="Add images"
                disabled={live || busy || images.length >= MAX_IMAGES}
                onClick={() => fileRef.current?.click()}
              >
                <IconImage />
              </button>
              <button type="button" className="session-tool" aria-label="Show Sessions" onClick={() => { setModelPickerOpen(false); setHistoryOpen(true); }}>
                <IconList />
                <span>Sessions</span>
              </button>
              <button
                type="button"
                className="session-tool"
                aria-label="New Session"
                onClick={() => {
                  setModelPickerOpen(false);
                  navigate("/sessions");
                  textareaRef.current?.focus();
                }}
              >
                <IconPlus />
                <span>New</span>
              </button>
              {!id && scopedProjectId === "" ? (
                <label className="session-pick">
                  <span className="sr-only">Project</span>
                  <select
                    value={projectId}
                    onChange={(event) => setProjectId(event.target.value as typeof projectId)}
                    aria-label="Project"
                  >
                    <option value="">Project</option>
                    {projects?.map((project) => (
                      <option key={project._id} value={project._id}>{project.name}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <div className="session-model-control" ref={modelPickerRef}>
                <button
                  type="button"
                  className="session-model-trigger"
                  aria-expanded={modelPickerOpen}
                  aria-controls={modelPickerId}
                  disabled={live}
                  onClick={() => setModelPickerOpen((open) => !open)}
                >
                  <span>{providerLabel(provider)} · {model}</span>
                  <small>{effort}</small>
                  <IconChevron />
                </button>
                {modelPickerOpen ? (
                  <div className="session-model-menu" id={modelPickerId} role="group" aria-label="Model settings">
                    <label>
                      <span>Provider</span>
                      <select
                        value={provider}
                        aria-label="Provider"
                        onChange={(event) => {
                          const next = event.target.value === "codex" ? "codex" : "grok";
                          const nextModel = isListedModel(next, model) ? model : modelsFor(next)[0];
                          changeProvider(next);
                          void applyConfigure({ provider: next, model: nextModel, effort });
                        }}
                      >
                        <option value="grok">{providerLabel("grok")}</option>
                        <option value="codex">{providerLabel("codex")}</option>
                      </select>
                    </label>
                    <label>
                      <span>Model</span>
                      <select
                        value={model}
                        aria-label="Model"
                        onChange={(event) => {
                          const next = event.target.value;
                          setModel(next);
                          void applyConfigure({ provider, model: next, effort });
                        }}
                      >
                        {models.map((item) => <option key={item} value={item}>{item}</option>)}
                        {isListedModel(provider, model) ? null : <option value={model}>{model}</option>}
                      </select>
                    </label>
                    <label>
                      <span>Reasoning effort</span>
                      <select
                        value={effort}
                        aria-label="Reasoning effort"
                        onChange={(event) => {
                          const next = event.target.value as Effort;
                          setEffort(next);
                          void applyConfigure({ provider, model, effort: next });
                        }}
                      >
                        {AGENT_EFFORTS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>
              <ContextMeter
                usage={active?.usage}
                windowTokens={modelContextWindow(model)}
                hideWhenEmpty={false}
                placement="up"
              />
            </div>
          </div>
          <p className="session-composer-hint">Enter to send · Shift+Enter for a new line · Drop or paste images</p>
        </form>
      </div>
    </div>
  );
}

function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 3.2v9.6M3.2 8h9.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 12.5V3.8M4.2 7.2 8 3.5l3.8 3.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconStop() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.2" fill="currentColor" />
    </svg>
  );
}

function IconImage() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="3.5" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="6" cy="7" r="1.1" fill="currentColor" />
      <path d="m4.2 11.2 2.4-2.4 1.6 1.5 2.2-2.6 2.4 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="m4 5.5 3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
