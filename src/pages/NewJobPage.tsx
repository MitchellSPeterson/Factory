import { useServer } from "../servers/connection";
import { useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useProjectScope } from "../projectScope";

export function NewJobForm({
  initialProjectId,
  initialDraft,
  onComplete,
  lockProject = false,
}: {
  initialProjectId?: string;
  initialDraft?: { request: string; githubIssueUrl: string; milestone: string; tags: string };
  onComplete?: (jobId: Id<"jobs">) => void;
  lockProject?: boolean;
}) {
  const { accessKey, server } = useServer();
  const projects = useQuery(api.projects.list);
  const recipes = useQuery(api.recipes.list);
  const create = useMutation(api.jobs.create);
  const navigate = useNavigate();
  const { projectId: scopedProjectId } = useProjectScope();
  const [projectId, setProjectId] = useState(initialProjectId ?? scopedProjectId);
  const [request, setRequest] = useState(initialDraft?.request ?? "");
  const [runtime, setRuntime] = useState<"local" | "cloud">("local");
  const [forceGrill, setForceGrill] = useState(false);
  const [recipeId, setRecipeId] = useState("");
  const [githubIssueUrl, setGithubIssueUrl] = useState(initialDraft?.githubIssueUrl ?? "");
  const [milestone, setMilestone] = useState(initialDraft?.milestone ?? "");
  const [tags, setTags] = useState(initialDraft?.tags ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selected = projects?.find((p) => p._id === projectId);
  const selectedWorkflow = recipes?.find((recipe) => recipe._id === recipeId);

  useEffect(() => {
    const preferredProjectId = initialProjectId ?? scopedProjectId;
    if (!preferredProjectId || !projects) return;
    const project = projects.find((item) => item._id === preferredProjectId);
    if (!project) return;
    setProjectId(project._id);
    setRuntime(project.defaultRuntime);
    setRecipeId(project.recipeId ?? "");
  }, [initialProjectId, projects, scopedProjectId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (projectId === "" || submitting) return;
    setSubmitting(true); setError("");
    try {
    const jobId = await create({
      projectId: projectId as Id<"projects">,
      accessKey: accessKey || undefined,
      request,
      runtime,
      forceGrill,
    recipeId: recipeId === "" ? undefined : (recipeId as Id<"recipes">),
      githubIssueUrl: githubIssueUrl || undefined,
      milestone: milestone || undefined,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    });
    if (onComplete) onComplete(jobId);
    else navigate(`/jobs/${jobId}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not create Job."); } finally { setSubmitting(false); }
  }

  return (
      <form className="stack new-job-form" onSubmit={(e) => void onSubmit(e)}>
        {lockProject ? (
          selected ? (
            <div className="selected-project">
              <span>Project</span>
              <strong>{selected.name}</strong>
            </div>
          ) : (
            <p className="form-notice">Choose a Project in the sidebar before creating a Job.</p>
          )
        ) : (
          <label>
            Project
            <select
              value={projectId}
              onChange={(e) => {
                const next = e.target.value;
                setProjectId(next);
                const p = projects?.find((x) => x._id === next);
                if (p) {
                  setRuntime(p.defaultRuntime);
                  setRecipeId(p.recipeId ?? "");
                }
              }}
            >
              <option value="">Select…</option>
              {projects?.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Workflow
          <select
            value={recipeId}
            onChange={(e) => setRecipeId(e.target.value)}
          >
            <option value="">Project default</option>
            {recipes?.map((recipe) => (
              <option key={recipe._id} value={recipe._id}>
                {recipe.name}
              </option>
            ))}
          </select>
        </label>
        {selectedWorkflow?.requestTemplate ? (
          <div className="template-notice">
            <span>This Workflow has a request template.</span>
            <button type="button" className="ghost" onClick={() => setRequest(selectedWorkflow.requestTemplate ?? "")}>Use template</button>
          </div>
        ) : null}
        <label>
          Request
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder={selectedWorkflow?.requestTemplate ?? "What should the agents do?"}
          />
        </label>
        <details className="job-link-fields">
          <summary>GitHub and planning details</summary>
          <div className="stack">
            <label>
              GitHub issue URL
              <input type="url" value={githubIssueUrl} onChange={(e) => setGithubIssueUrl(e.target.value)} placeholder="https://github.com/owner/repo/issues/123" />
            </label>
            <label>
              Milestone
              <input value={milestone} onChange={(e) => setMilestone(e.target.value)} placeholder="v1.0" />
            </label>
            <label>
              Tags
              <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="frontend, urgent" />
            </label>
          </div>
        </details>
        <label>
          Runtime
          <select
            value={runtime}
            onChange={(e) => setRuntime(e.target.value as typeof runtime)}
          >
            <option value="local">local</option>
            <option value="cloud">cloud</option>
          </select>
        </label>
        <label className="row" style={{ display: "flex" }}>
          <input
            type="checkbox"
            checked={forceGrill}
            onChange={(e) => setForceGrill(e.target.checked)}
            style={{ width: "auto" }}
          />
          Force grill on Plan
        </label>
        {selected ? (
          <p className="muted">
            {selected.kind} · {selected.localPath}
          </p>
        ) : null}
        {selected?.serverId && selected.cloneStatus !== "ready" && <p className="muted">Wait for cloning to finish before starting a Job.</p>}
        {selected?.serverId && server?.id !== selected.serverId && <p className="muted">Pair this Project’s worker in Settings before starting a Job.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={!selected || submitting || !request.trim() || (!!selected.serverId && (selected.cloneStatus !== "ready" || server?.id !== selected.serverId))}>{submitting ? "Starting…" : "Start job"}</button>
      </form>
  );
}

export function NewJobPage() {
  return (
    <>
      <div className="pagehead"><h1>New job</h1></div>
      <NewJobForm />
    </>
  );
}
