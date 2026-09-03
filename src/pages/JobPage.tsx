import { useMutation, useQuery } from "convex/react";
import { FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { laneOf } from "../../convex/lib/jobState";
import { Badge } from "../status";

export function JobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const id = jobId as Id<"jobs">;
  const view = useQuery(api.jobs.get, { jobId: id });
  const answerAsk = useMutation(api.jobs.answerAsk);
  const acceptSpec = useMutation(api.jobs.acceptSpec);
  const rejectSpec = useMutation(api.jobs.rejectSpec);
  const acceptCodeReview = useMutation(api.jobs.acceptCodeReview);
  const [rejectNote, setRejectNote] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});

  if (view === undefined) return <p className="muted">Loading…</p>;
  if (view === null) return <p>Job not found.</p>;

  const { job, project, runs, artifacts, messages, pendingAsk } = view;
  const spec = artifacts.filter((a) => a.kind === "spec").at(-1);
  const verdict = artifacts.filter((a) => a.kind === "plan_verdict").at(-1);
  const pr = artifacts.filter((a) => a.kind === "pr_url").at(-1);

  async function onAnswer(e: FormEvent) {
    e.preventDefault();
    if (!pendingAsk) return;
    await answerAsk({
      askId: pendingAsk._id,
      answers: pendingAsk.questions.map((q) => ({
        id: q.id,
        text: answers[q.id] ?? q.recommend,
      })),
    });
    setAnswers({});
  }

  return (
    <>
      <p className="crumb">
        <Link to="/jobs">Jobs</Link> /{" "}
        <Link to={`/projects/${project._id}`}>{project.name}</Link>
      </p>
      <div className="pagehead">
        <div className="row">
          <h1>Job</h1>
          <Badge status={laneOf(job.status)} />
          <span className="mono muted">{job.stageKey}</span>
        </div>
      </div>
      <p>{job.request}</p>

      {pendingAsk ? (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Ask</h2>
          <form className="stack" onSubmit={(e) => void onAnswer(e)}>
            {pendingAsk.questions.map((q) => (
              <label key={q.id}>
                {q.title}
                <span className="muted">{q.body}</span>
                <textarea
                  value={answers[q.id] ?? q.recommend}
                  onChange={(e) =>
                    setAnswers((cur) => ({ ...cur, [q.id]: e.target.value }))
                  }
                />
              </label>
            ))}
            <button type="submit">Answer</button>
          </form>
        </section>
      ) : null}

      {laneOf(job.status) === "planReview" && spec ? (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Accept spec</h2>
          {verdict ? (
            <p className="mono muted">{verdict.body}</p>
          ) : null}
          <pre>{spec.body}</pre>
          <div className="row">
            <button type="button" onClick={() => void acceptSpec({ jobId: id })}>
              Accept spec
            </button>
            <input
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Send back with a note"
            />
            <button
              type="button"
              className="ghost"
              onClick={() =>
                void rejectSpec({ jobId: id, note: rejectNote || "revise" })
              }
            >
              Send back
            </button>
          </div>
        </section>
      ) : null}

      {laneOf(job.status) === "codeReview" ? (
        <section className="card stack">
          <h2 style={{ margin: 0 }}>Code review</h2>
          <p className="muted">Building finished. Accept to open the PR.</p>
          <button type="button" onClick={() => void acceptCodeReview({ jobId: id })}>
            Accept and open PR
          </button>
        </section>
      ) : null}

      {pr ? (
        <p>
          PR: <a href={pr.body}>{pr.body}</a>
        </p>
      ) : null}

      <h2>Runs</h2>
      <div className="stack">
        {runs.map((run) => (
          <div className="card" key={run._id}>
            <div className="row">
              <strong>{run.stageKey}</strong>
              <Badge status={run.status} />
              {run.agentId ? (
                <span className="mono muted">{run.agentId}</span>
              ) : null}
            </div>
            {run.error ? <p className="muted">{run.error}</p> : null}
          </div>
        ))}
      </div>

      <h2>Log</h2>
      {messages.length === 0 ? (
        <p className="muted">No messages yet.</p>
      ) : (
        <pre>{messages.map((m) => m.text).join("\n\n")}</pre>
      )}
    </>
  );
}
