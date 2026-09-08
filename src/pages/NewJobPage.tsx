import { useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useProjectScope } from "../projectScope";

export function NewJobForm({
  initialProjectId,
  onComplete,
  lockProject = false,
}: {
  initialProjectId?: string;
  onComplete?: (jobId: Id<"jobs">) => void;
  lockProject?: boolean;
}) {
  const projects = useQuery(api.projects.list);
  const recipes = useQuery(api.recipes.list);
  const create = useMutation(api.jobs.create);
  const navigate = useNavigate();
  const { projectId: scopedProjectId } = useProjectScope();
  const [projectId, setProjectId] = useState(initialProjectId ?? scopedProjectId);
  const [request, setRequest] = useState("");
  const [runtime, setRuntime] = useState<"local" | "cloud">("local");
  const [forceGrill, setForceGrill] = useState(false);
  const [recipeId, setRecipeId] = useState("");
  const [githubIssueUrl, setGithubIssueUrl] = useState("");
  const [milestone, setMilestone] = useState("");
  const [tags, setTags] = useState("");

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
    if (projectId === "") return;
    const jobId = await create({
      projectId: projectId as Id<"projects">,
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
        <button type="submit" disabled={!selected}>Start job</button>
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
