import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { LANES, laneOf } from "../../convex/lib/jobState";
import { Badge } from "../status";
import { formatTokens } from "../formatTokens";
import { useProjectScope } from "../projectScope";

const ATTENTION_LANES = new Set(["needsDetail", "planReview", "codeReview", "failed"]);

function stageTitle(stageKey: string) {
  return stageKey.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[-_]/g, " ");
}

function createdAt(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(timestamp);
}

export function JobsPage({ onNewJob }: { onNewJob: () => void }) {
  const jobs = useQuery(api.jobs.list);
  const recipes = useQuery(api.recipes.list);
  const migrate = useMutation(api.jobs.migrateLanes);
  const [search, setSearch] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const [laneId, setLaneId] = useState("");
  const { projectId } = useProjectScope();

  useEffect(() => {
    void migrate().catch(() => {});
  }, [migrate]);

  const scoped =
    jobs?.filter(
      (row) => (projectId === "" || row.job.projectId === projectId) && (workflowId === "" || row.job.recipeId === workflowId),
    ) ?? [];
  const query = search.trim().toLowerCase();
  const visible = scoped.filter((row) => {
    const matchesLane = laneId === "" || laneOf(row.job.status) === laneId;
    const matchesSearch = query === "" || [row.job.request, row.projectName, row.recipeName, row.job.stageKey, row.job.runtime, row.job.error, row.job.githubIssueUrl, row.job.milestone, ...(row.job.tags ?? [])]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesLane && matchesSearch;
  });
  const attentionCount = visible.filter(({ job }) => ATTENTION_LANES.has(laneOf(job.status))).length;

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Jobs</h1>
          <p className="muted">
            {jobs === undefined
              ? "View all Jobs across Projects."
              : `${visible.length} jobs · ${attentionCount} need attention · ${projectId === "" ? "View all" : "Project scope"}`}
          </p>
        </div>
        <button type="button" onClick={onNewJob}>New job</button>
      </div>
      <div className="board-filters jobs-filters">
        <label>
          Search
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Job, Project, Workflow…" />
        </label>
        <label>
          Workflow
          <select
            value={workflowId}
            onChange={(e) => setWorkflowId(e.target.value)}
          >
            <option value="">All</option>
            {recipes?.map((recipe) => (
              <option key={recipe._id} value={recipe._id}>
                {recipe.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Lane
          <select value={laneId} onChange={(e) => setLaneId(e.target.value)}>
            <option value="">All</option>
            {LANES.map((lane) => <option key={lane.id} value={lane.id}>{lane.title}</option>)}
            <option value="failed">Failed</option>
          </select>
        </label>
      </div>
      {jobs === undefined ? (
        <p className="muted">Loading Jobs…</p>
      ) : visible.length === 0 ? (
        <div className="jobs-empty">No Jobs match the current search and filters.</div>
      ) : (
        <div className="jobs-grid">
          {visible.map(({ job, projectName, recipeName }) => {
            const lane = laneOf(job.status);
            const needsAttention = ATTENTION_LANES.has(lane);
            return (
              <Link className="job-card" key={job._id} to={`/jobs/${job._id}`}>
                <div className="job-card-topline">
                  <span className="job-project">{projectName}</span>
                  {needsAttention ? <span className="attention-flag">Needs attention</span> : null}
                </div>
                <h2 className="job-title">{job.request}</h2>
                <div className="job-status-row">
                  <Badge status={lane} />
                  <span className="stage-chip">Stage: {stageTitle(job.stageKey)}</span>
                  {job.tags?.slice(0, 2).map((tag) => <span className="tag" key={tag}>{tag}</span>)}
                </div>
                <dl className="job-details">
                  <div>
                    <dt>Workflow</dt>
                    <dd>{recipeName}</dd>
                  </div>
                  <div>
                    <dt>Token usage</dt>
                    <dd>{job.usage?.totalTokens ? formatTokens(job.usage.totalTokens) : <span className="muted">—</span>}</dd>
                  </div>
                  <div>
                    <dt>Runtime</dt>
                    <dd>{job.runtime}</dd>
                  </div>
                  <div>
                    <dt>Created</dt>
                    <dd>{createdAt(job._creationTime)}</dd>
                  </div>
                </dl>
                {job.error ? <p className="job-error">{job.error}</p> : null}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
