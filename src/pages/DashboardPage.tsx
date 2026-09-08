import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { LANES, laneOf } from "../../convex/lib/jobState";
import { useProjectScope } from "../projectScope";

export function DashboardPage({ onNewJob }: { onNewJob: () => void }) {
  const jobs = useQuery(api.jobs.list);
  const projects = useQuery(api.projects.list);
  const { projectId } = useProjectScope();
  const scopedJobs = (jobs ?? []).filter(
    (row) => projectId === "" || row.job.projectId === projectId,
  );
  const currentProject = projects?.find((project) => project._id === projectId);
  const active = scopedJobs.filter((row) => {
    const lane = laneOf(row.job.status);
    return lane !== "pr" && lane !== "failed";
  }).length;
  const needsAttention = scopedJobs.filter((row) => {
    const lane = laneOf(row.job.status);
    return lane === "needsDetail" || lane === "planReview" || lane === "codeReview" || lane === "failed";
  }).length;
  const runs = new Set(scopedJobs.map((row) => row.job._id)).size;
  const workflows = new Set(scopedJobs.map((row) => row.job.recipeId)).size;

  return (
    <>
      <div className="pagehead dashboard-head">
        <div>
          <p className="eyebrow">Project dashboard</p>
          <h1>{currentProject?.name ?? "View all"}</h1>
          <p className="muted">
            {currentProject
              ? "A live summary for the selected Project."
              : "A live summary across every Project."}
          </p>
        </div>
        <button type="button" onClick={onNewJob}>New job</button>
      </div>

      <section className="metric-grid" aria-label="Project summary">
        <article className="metric-card"><span>Total jobs</span><strong>{jobs === undefined ? "—" : scopedJobs.length}</strong><small>in this scope</small></article>
        <article className="metric-card"><span>Active jobs</span><strong>{jobs === undefined ? "—" : active}</strong><small>moving through a Workflow</small></article>
        <article className="metric-card"><span>Needs attention</span><strong>{jobs === undefined ? "—" : needsAttention}</strong><small>asks, reviews, or failed Jobs</small></article>
        <article className="metric-card"><span>Workflows used</span><strong>{jobs === undefined ? "—" : workflows}</strong><small>across {runs} Jobs</small></article>
      </section>

      <section className="dashboard-section">
        <div className="section-heading"><div><h2>Jobs by Lane</h2><p>Where work is right now.</p></div><Link to="/jobs">Open Jobs</Link></div>
        <div className="lane-summary">
          {LANES.map((lane) => {
            const count = scopedJobs.filter((row) => laneOf(row.job.status) === lane.id).length;
            const percentage = scopedJobs.length === 0 ? 0 : (count / scopedJobs.length) * 100;
            return <div className="lane-summary-row" key={lane.id}><span>{lane.title}</span><div className="lane-summary-bar"><i style={{ width: `${percentage}%` }} /></div><strong>{jobs === undefined ? "—" : count}</strong></div>;
          })}
        </div>
      </section>

      <section className="dashboard-section dashboard-detail-grid">
        <article className="dashboard-detail"><p className="eyebrow">Usage</p><h2>Total tokens</h2><strong className="metric-empty">Not tracked yet</strong><p>Token usage will appear here once Runs report it.</p></article>
        <article className="dashboard-detail"><p className="eyebrow">Project scope</p><h2>{currentProject?.name ?? "All Projects"}</h2><p>{currentProject ? currentProject.githubRepo || currentProject.localPath : "Choose a Project in the sidebar to focus this dashboard and Jobs board."}</p></article>
      </section>
    </>
  );
}
