import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { LANES, laneOf } from "../../convex/lib/jobState";
import { Badge } from "../status";

export function JobsPage() {
  const jobs = useQuery(api.jobs.list);
  const recipes = useQuery(api.recipes.list);
  const migrate = useMutation(api.jobs.migrateLanes);
  const [workflowId, setWorkflowId] = useState("");

  useEffect(() => {
    void migrate().catch(() => {});
  }, [migrate]);

  const visible =
    jobs?.filter(
      (row) => workflowId === "" || row.job.recipeId === workflowId,
    ) ?? [];
  const failed =
    visible.filter((row) => laneOf(row.job.status) === "failed") ?? [];

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Jobs</h1>
          <p className="muted">
            {jobs === undefined
              ? "View all Jobs across Projects."
              : `${jobs.length} jobs · View all across Projects`}
          </p>
        </div>
        <Link to="/jobs/new">
          <button type="button">New job</button>
        </Link>
      </div>
      <div className="board-filters">
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
      </div>
      <div className="board">
        {LANES.map((lane) => {
          const cards =
            visible.filter((row) => laneOf(row.job.status) === lane.id) ?? [];
          return (
            <section className="lane" key={lane.id}>
              <header className="lane-head">
                <h2>{lane.title}</h2>
                <span className="lane-count">{cards.length}</span>
              </header>
              <div className="lane-cards">
                {cards.map(({ job, projectName, recipeName }) => (
                  <Link className="card" key={job._id} to={`/jobs/${job._id}`}>
                    <strong>{projectName}</strong>
                    <div className="muted">{job.request}</div>
                    <div className="row">
                      <Badge status={laneOf(job.status)} />
                      <span className="mono muted">{job.stageKey}</span>
                    </div>
                    <div className="muted">{recipeName}</div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      {failed.length > 0 ? (
        <section className="failed-strip">
          <h2>Failed</h2>
          <div className="box list">
            {failed.map(({ job, projectName, recipeName }) => (
              <Link className="card" key={job._id} to={`/jobs/${job._id}`}>
                <strong>{projectName}</strong>
                <div className="muted">{job.request}</div>
                <div className="muted">{recipeName}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
