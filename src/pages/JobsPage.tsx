import { useMutation, useQuery } from "convex/react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { LANES, laneOf } from "../../convex/lib/jobState";
import { Badge } from "../status";

export function JobsPage() {
  const jobs = useQuery(api.jobs.list);
  const migrate = useMutation(api.jobs.migrateLanes);

  useEffect(() => {
    void migrate().catch(() => {});
  }, [migrate]);

  const failed = jobs?.filter((row) => laneOf(row.job.status) === "failed") ?? [];

  return (
    <>
      <div className="pagehead">
        <h1>Jobs</h1>
        <Link to="/jobs/new">
          <button type="button">New job</button>
        </Link>
      </div>
      <div className="board">
        {LANES.map((lane) => {
          const cards =
            jobs?.filter((row) => laneOf(row.job.status) === lane.id) ?? [];
          return (
            <section className="lane" key={lane.id}>
              <header className="lane-head">
                <h2>{lane.title}</h2>
                <span className="lane-count">{cards.length}</span>
              </header>
              <div className="lane-cards">
                {cards.map(({ job, projectName }) => (
                  <Link className="card" key={job._id} to={`/jobs/${job._id}`}>
                    <strong>{projectName}</strong>
                    <div className="muted">{job.request}</div>
                    <div className="row">
                      <Badge status={laneOf(job.status)} />
                      <span className="mono muted">{job.stageKey}</span>
                    </div>
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
            {failed.map(({ job, projectName }) => (
              <Link className="card" key={job._id} to={`/jobs/${job._id}`}>
                <strong>{projectName}</strong>
                <div className="muted">{job.request}</div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
