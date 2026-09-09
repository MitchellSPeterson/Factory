import { AddGitHubProject } from "../servers/AddGitHubProject";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { useProjectScope } from "../projectScope";
import { useGitHub } from "../github/connection";
import { GitHubConnection } from "../github/GitHubConnection";
import { github, repoPath, issueDraft, type Issue, type PullRequest, type WorkflowRun } from "../github/api";
import { NewJobForm } from "./NewJobPage";

type Tab = "issues" | "pulls" | "actions";
type Result = { key: string; issues: Issue[]; pulls: PullRequest[]; runs: WorkflowRun[]; hasMore: boolean };
export function GitHubPage() {
  const { projectId } = useProjectScope();
  const projects = useQuery(api.projects.list);
  const project = projects?.find(item => item._id === projectId);
  const { connection } = useGitHub();
  const [tab, setTab] = useState<Tab>("issues");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Issue | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const repo = project?.githubRepo ?? "";
  const key = `${connection?.login}:${repo}:${tab}:${page}`;
  useEffect(() => { setPage(1); setDraft(null); }, [projectId, tab]);
  useEffect(() => {
    if (!draft) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDraft(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft]);
  useEffect(() => {
    if (!connection || !repo) return;
    const controller = new AbortController();
    setBusy(true); setError("");
    async function load() {
      try {
        const path = repoPath(repo);
        let next: Result;
        if (tab === "issues") {
          const rows = await github<Issue[]>(connection!.token, `${path}/issues?state=open&sort=updated&per_page=30&page=${page}`, controller.signal);
          next = { key, issues: rows.filter(row => !row.pull_request), pulls: [], runs: [], hasMore: rows.length === 30 };
        } else if (tab === "pulls") {
          const rows = await github<PullRequest[]>(connection!.token, `${path}/pulls?state=open&sort=updated&per_page=30&page=${page}`, controller.signal);
          next = { key, issues: [], pulls: rows, runs: [], hasMore: rows.length === 30 };
        } else {
          const rows = await github<{ workflow_runs: WorkflowRun[] }>(connection!.token, `${path}/actions/runs?per_page=30&page=${page}`, controller.signal);
          next = { key, issues: [], pulls: [], runs: rows.workflow_runs, hasMore: rows.workflow_runs.length === 30 };
        }
        if (!controller.signal.aborted) { setResult(next); setUpdatedAt(new Date()); }
      } catch (err) { if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : "Unable to load GitHub."); setResult(null); } }
      finally { if (!controller.signal.aborted) setBusy(false); }
    }
    void load();
    return () => controller.abort();
  }, [connection, repo, tab, page, revision, key]);
  const visible = result?.key === key ? result : null;
  return <>
    <div className="pagehead"><div><p className="eyebrow">{project ? `Project scope · ${project.name}` : "GitHub"}</p><h1>GitHub</h1><p className="muted">From an issue to a Job, with pull requests and CI close at hand.</p></div>{connection && <button className="ghost" onClick={() => setRevision(value => value + 1)} disabled={busy || !repo}>Refresh</button>}</div>
    {!connection ? <GitHubConnection /> : <>
      <div className="github-account"><span>Connected as <strong>@{connection.login}</strong></span><Link className="text-button" to="/settings">Manage connection</Link></div>
      {!projectId ? <section className="settings-section"><AddGitHubProject /><h2>Choose a Project</h2><p className="muted">Use the sidebar to select a Project scope and see its GitHub activity.</p><Link to="/settings" className="text-button">Add or connect a Project →</Link></section> : !project ? <p className="muted">{projects ? "This Project no longer exists. Choose another Project." : "Loading Project…"}</p> : !repo ? <section className="settings-section"><h2>Connect a repository</h2><p className="muted">Choose a GitHub repository for {project.name} to see its activity here.</p><Link className="text-button" to={`/projects/${project._id}`}>Choose repository →</Link></section> : <>
        <div className="github-toolbar"><a className="text-button" href={`https://github.com/${repo}`} target="_blank" rel="noreferrer">{repo} ↗</a>{updatedAt && <span className="muted">Updated {updatedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>}</div>
        <div className="github-tabs" aria-label="GitHub activity">{([ ["issues", "Issues"], ["pulls", "Pull requests"], ["actions", "CI / Actions"] ] as const).map(([value, label]) => <button key={value} className={tab === value ? "active" : "ghost"} aria-pressed={tab === value} onClick={() => { setTab(value); setPage(1); }}>{label}</button>)}</div>
        {error && <p className="error" role="alert">{error} <button className="ghost" onClick={() => setRevision(value => value + 1)}>Retry</button></p>}
        {busy && <p className="muted" role="status">Loading GitHub activity…</p>}
        {!busy && visible && <div className="github-list">
          {visible.issues.map(issue => <article className="github-item" key={issue.id}><span className="github-marker">○</span><div><a className="github-title" href={issue.html_url} target="_blank" rel="noreferrer">{issue.title} ↗</a><p className="muted">#{issue.number}{issue.milestone ? ` · ${issue.milestone.title}` : ""}</p><div className="github-labels">{issue.labels.map(label => <span className="github-badge" key={label.name}>{label.name}</span>)}</div></div><button className="ghost" onClick={() => setDraft(issue)}>Create Job</button></article>)}
          {visible.pulls.map(pr => <article className="github-item" key={pr.id}><span className="github-marker">⑂</span><div><a className="github-title" href={pr.html_url} target="_blank" rel="noreferrer">{pr.title} ↗</a><p className="muted">#{pr.number} · {pr.user.login} · {pr.head.ref}</p></div><span className="github-badge">{pr.draft ? "Draft" : "Open"}</span></article>)}
          {visible.runs.map(run => <article className="github-item" key={run.id}><span className={`github-marker ${run.conclusion === "failure" ? "failed" : ""}`}>{run.conclusion === "success" ? "✓" : run.conclusion === "failure" ? "×" : "◷"}</span><div><a className="github-title" href={run.html_url} target="_blank" rel="noreferrer">{run.name || "GitHub Actions"} ↗</a><p className="muted">#{run.run_number} · {run.head_branch}</p></div><span className="github-badge">{(run.conclusion ?? run.status).replaceAll("_", " ")}</span></article>)}
          {visible.issues.length + visible.pulls.length + visible.runs.length === 0 && <div className="github-empty"><h2>{tab === "issues" ? "No open issues on this page" : tab === "pulls" ? "No open pull requests" : "No CI runs yet"}</h2><p className="muted">{visible.hasMore ? "Check the next page for more activity." : "Refresh to check for new activity."}</p></div>}
          <div className="github-pagination"><button className="ghost" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button><span className="muted">Page {page}</span><button className="ghost" disabled={!visible.hasMore} onClick={() => setPage(page + 1)}>Next</button></div>
        </div>}
      </>}
    </>}
    {draft && project && connection && <>
      <div className="sheet-scrim" role="presentation" onMouseDown={() => setDraft(null)} />
      <div className="github-draft">
        <div className="section-heading"><div><p className="eyebrow">GitHub issue #{draft.number}</p><h2>Create Job</h2><p className="muted">Review the request and Workflow before starting.</p></div><button className="ghost" onClick={() => setDraft(null)}>Cancel</button></div>
        <NewJobForm key={`${project._id}:${draft.id}`} initialProjectId={project._id} initialDraft={issueDraft(draft)} lockProject />
      </div>
    </>}
  </>;
}
