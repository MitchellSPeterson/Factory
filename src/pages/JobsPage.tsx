import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { LANES, laneOf } from "../../convex/lib/jobState";
import { Badge } from "../status";
import { formatUsageIO } from "../formatTokens";
import { formatDuration, jobDurationMs } from "../formatDuration";
import { useProjectScope } from "../projectScope";
import {
  ATTENTION_LANES,
  matchesProgress,
  parseLane,
  parseProgress,
  PROGRESS_OPTIONS,
} from "../jobsProgress";
import {
  compareJobs,
  doneNudgeLabel,
  formatJobAge,
  jobsHeadline,
  shouldShowStage,
  stageTitle,
} from "../jobsBoard";

export function JobsPage({ onNewJob }: { onNewJob: () => void }) {
  const jobs = useQuery(api.jobs.list);
  const recipes = useQuery(api.recipes.list);
  const migrate = useMutation(api.jobs.migrateLanes);
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [workflowId, setWorkflowId] = useState("");
  const progress = parseProgress(searchParams.get("progress"));
  const laneId = parseLane(searchParams.get("lane"));
  const { projectId } = useProjectScope();
  const scope = projectId === "" ? "all" : "project";

  function setFilter(key: "progress" | "lane", value: string, blank: string) {
    const next = new URLSearchParams(searchParams);
    if (value === blank) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setSearch("");
    setWorkflowId("");
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete("progress");
      next.delete("lane");
      return next;
    }, { replace: true });
  }

  useEffect(() => {
    void migrate().catch(() => {});
  }, [migrate]);

  const query = search.trim().toLowerCase();
  const filtersOn = query !== "" || workflowId !== "" || progress !== "active" || laneId !== "";

  const { scoped, visible, attentionCount, hiddenDone } = useMemo(() => {
    const scopedRows =
      jobs?.filter(
        (row) =>
          (projectId === "" || row.job.projectId === projectId) &&
          (workflowId === "" || row.job.recipeId === workflowId),
      ) ?? [];
    const matched = scopedRows.filter((row) => {
      const lane = laneOf(row.job.status);
      const matchesLane = laneId === "" || lane === laneId;
      const matchesSearch =
        query === "" ||
        [
          row.job.request,
          row.projectName,
          row.recipeName,
          row.job.stageKey,
          row.job.runtime,
          row.job.error,
          row.job.githubIssueUrl,
          row.job.milestone,
          ...(row.job.tags ?? []),
        ].some((value) => value?.toLowerCase().includes(query));
      return matchesProgress(lane, progress) && matchesLane && matchesSearch;
    });
    const sorted = [...matched].sort((a, b) =>
      compareJobs(
        { lane: laneOf(a.job.status), createdAt: a.job._creationTime },
        { lane: laneOf(b.job.status), createdAt: b.job._creationTime },
      ),
    );
    return {
      scoped: scopedRows,
      visible: sorted,
      attentionCount: sorted.filter(({ job }) => ATTENTION_LANES.has(laneOf(job.status))).length,
      hiddenDone:
        progress === "active" ? scopedRows.filter((row) => laneOf(row.job.status) === "pr").length : 0,
    };
  }, [jobs, projectId, workflowId, laneId, query, progress]);

  const headline = jobsHeadline({
    loading: jobs === undefined,
    visibleCount: visible.length,
    scopedCount: scoped.length,
    attentionCount,
    scope,
  });
  const showDone = doneNudgeLabel(hiddenDone);

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Jobs</h1>
          <div className="jobs-summary">
            <p className="muted" aria-live="polite">
              {headline}
            </p>
            {showDone !== "" ? (
              <button type="button" className="jobs-done-nudge" onClick={() => setFilter("progress", "all", "active")}>
                {showDone}
              </button>
            ) : null}
          </div>
        </div>
        <button type="button" onClick={onNewJob}>
          New job
        </button>
      </div>

      <div className="jobs-toolbar">
        <label className="jobs-search">
          Search
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Job, Project, Workflow…"
          />
        </label>
        <label>
          Workflow
          <select value={workflowId} onChange={(e) => setWorkflowId(e.target.value)}>
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
          <select value={laneId} onChange={(e) => setFilter("lane", e.target.value, "")}>
            <option value="">All</option>
            {LANES.map((lane) => (
              <option key={lane.id} value={lane.id}>
                {lane.title}
              </option>
            ))}
            <option value="failed">Failed</option>
          </select>
        </label>
        <div className="progress-chips" role="radiogroup" aria-label="Progress">
          {PROGRESS_OPTIONS.map((option) => (
            <label key={option.id} className={progress === option.id ? "chip-option is-on" : "chip-option"}>
              <input
                type="radio"
                name="jobs-progress"
                value={option.id}
                checked={progress === option.id}
                onChange={() => setFilter("progress", option.id, "active")}
              />
              {option.title}
            </label>
          ))}
        </div>
      </div>

      {jobs === undefined ? (
        <div className="jobs-grid" aria-busy="true" aria-label="Loading Jobs">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="job-card job-card-skeleton" key={index} aria-hidden="true">
              <span className="skel skel-sm" />
              <span className="skel skel-title" />
              <span className="skel skel-chip" />
              <span className="skel skel-meta" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 && scoped.length === 0 && query === "" ? (
        <div className="jobs-empty">
          <strong>No Jobs in this scope yet.</strong>
          <p>Start a Job against a Project. Factory will move it through Lanes until a pull request.</p>
          <button type="button" onClick={onNewJob}>
            New job
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="jobs-empty">
          <strong>No Jobs match.</strong>
          <p>Nothing in this search, Workflow, Progress, or Lane.</p>
          {filtersOn ? (
            <button type="button" className="ghost" onClick={clearFilters}>
              Clear filters
            </button>
          ) : null}
        </div>
      ) : (
        <div className="jobs-grid">
          {visible.map(({ job, projectName, recipeName, liveStartedAt }) => {
            const lane = laneOf(job.status);
            const needsAttention = ATTENTION_LANES.has(lane);
            const duration = formatDuration(
              jobDurationMs(job, liveStartedAt !== undefined ? [{ startedAt: liveStartedAt }] : []),
            );
            const usage = formatUsageIO(job.usage);
            const cardClass =
              lane === "failed"
                ? "job-card job-card-failed"
                : needsAttention
                  ? "job-card job-card-attention"
                  : "job-card";
            return (
              <Link className={cardClass} key={job._id} to={`/jobs/${job._id}`}>
                <div className="job-card-topline">
                  {scope === "all" ? <span className="job-project">{projectName}</span> : null}
                  <time className="job-age" dateTime={new Date(job._creationTime).toISOString()}>
                    {formatJobAge(job._creationTime)}
                  </time>
                </div>
                <h2 className="job-title" title={job.request}>
                  {job.request}
                </h2>
                <div className="job-status-row">
                  <Badge status={lane} />
                  {shouldShowStage(job.stageKey, lane) ? (
                    <span className="stage-chip">{stageTitle(job.stageKey)}</span>
                  ) : null}
                  {job.tags?.slice(0, 2).map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="job-meta">
                  <span>{recipeName}</span>
                  {duration ? <span>{duration}</span> : null}
                  {usage ? <span>{usage}</span> : null}
                </p>
                {job.error ? <p className="job-error">{job.error}</p> : null}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
