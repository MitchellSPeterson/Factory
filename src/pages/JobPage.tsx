import { useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useState } from "react";
import Markdown from "react-markdown";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { laneOf } from "../../convex/lib/jobState";
import { Badge } from "../status";

// ponytail: odd fence count mid-stream would eat the rest of the log
function renderableLog(text: string): string {
  const fences = (text.match(/^```/gm) ?? []).length;
  return fences % 2 === 1 ? `${text}\n\`\`\`` : text;
}

function deliveryHint(mode: "pollBetweenTurns" | "nextRun" | "transcriptOnly"): string {
  if (mode === "pollBetweenTurns") {
    return "The agent will see this after its current step.";
  }
  if (mode === "nextRun") {
    return "Saved on the transcript. The agent sees it on the next Run or when it checks for notes.";
  }
  return "Saved on the transcript only. This Job has no further Runs.";
}

function newCommandId(): string {
  return crypto.randomUUID();
}

export function JobPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const id = jobId as Id<"jobs">;
  const navigate = useNavigate();
  const view = useQuery(api.jobs.get, { jobId: id });
  const stopJob = useMutation(api.jobs.stop);
  const dispatchCommand = useMutation(api.jobs.dispatchCommand);
  const removeJob = useMutation(api.jobs.remove);
  const answerAsk = useMutation(api.jobs.answerAsk);
  const acceptSpec = useMutation(api.jobs.acceptSpec);
  const rejectSpec = useMutation(api.jobs.rejectSpec);
  const acceptCodeReview = useMutation(api.jobs.acceptCodeReview);
  const workflow = useQuery(
    api.recipes.get,
    view ? { recipeId: view.job.recipeId } : "skip",
  );
  const [rejectNote, setRejectNote] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [expandedStageKey, setExpandedStageKey] = useState("");
  const [jobActionBusy, setJobActionBusy] = useState(false);
  const [jobActionError, setJobActionError] = useState("");
  const [chatDraft, setChatDraft] = useState("");
  useEffect(() => {
    if (view) setExpandedStageKey(view.job.stageKey);
  }, [view?.job._id]);

  if (view === undefined) return <p className="muted">Loading…</p>;
  if (view === null) return <p>Job not found.</p>;

  const {
    job,
    project,
    recipeName,
    runs,
    asks,
    artifacts,
    messages,
    commands,
    control,
    pendingAsk,
  } = view;
  const spec = artifacts.filter((a) => a.kind === "spec").at(-1);
  const verdict = artifacts.filter((a) => a.kind === "plan_verdict").at(-1);

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

  async function runJobAction(label: string, action: () => Promise<void>) {
    setJobActionBusy(true);
    setJobActionError("");
    try {
      await action();
    } catch (error) {
      setJobActionError(error instanceof Error ? error.message : `Could not ${label}.`);
    } finally {
      setJobActionBusy(false);
    }
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
          <span className="muted">{control.activity}</span>
        </div>
        <div className="row">
          {control.availableCommands.includes("finishJob") ? (
            <button
              type="button"
              className="ghost"
              disabled={jobActionBusy}
              onClick={() => {
                if (!window.confirm("Finish this Job now? Remaining Stages will be skipped.")) return;
                void runJobAction("finish Job", async () => {
                  await dispatchCommand({
                    jobId: id,
                    commandId: newCommandId(),
                    command: { kind: "finishJob" },
                  });
                });
              }}
            >Finish Job</button>
          ) : null}
          {control.availableCommands.includes("stopJob") ? (
            <button
              type="button"
              className="ghost"
              disabled={jobActionBusy}
              onClick={() => {
                if (!window.confirm("Stop this Job? Its active Run will be terminated.")) return;
                void runJobAction("stop Job", async () => {
                  await stopJob({ jobId: id });
                });
              }}
            >Stop Job</button>
          ) : null}
          <button
            type="button"
            className="danger-button"
            disabled={jobActionBusy}
            onClick={() => {
              if (!window.confirm("Delete this Job and all of its Runs, Asks, artifacts, and activity? Any active Run will be stopped.")) return;
              void runJobAction("delete Job", async () => {
                await removeJob({ jobId: id });
                navigate("/jobs");
              });
            }}
          >Delete Job</button>
        </div>
      </div>
      {jobActionError ? <p role="alert" className="error">{jobActionError}</p> : null}
      <p className="muted">
        <Link to={`/workflows/${job.recipeId}`}>{recipeName}</Link>
      </p>
      <p>{job.request}</p>
      {job.githubIssueUrl || job.milestone || (job.tags?.length ?? 0) > 0 ? (
        <div className="job-references">
          {job.githubIssueUrl ? <a href={job.githubIssueUrl} target="_blank" rel="noreferrer">GitHub issue ↗</a> : null}
          {job.milestone ? <span>Milestone: {job.milestone}</span> : null}
          {job.tags?.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
        </div>
      ) : null}

      <section className="workflow-history" aria-labelledby="workflow-history-title">
        <div className="section-heading">
          <div>
            <h2 id="workflow-history-title">Workflow</h2>
            <p>Open any Stage to review its agent activity and artifacts.</p>
          </div>
          <span className="muted">Current: {job.stageKey}</span>
        </div>
        {workflow === undefined ? (
          <p className="muted">Loading Stages…</p>
        ) : workflow === null || workflow.stages.length === 0 ? (
          <p className="muted">This Workflow has no Stages.</p>
        ) : (
          <div className="stage-history-list">
            {workflow.stages.map((stage, index) => {
              const stageRuns = runs.filter((run) => run.stageKey === stage.key);
              const latestRun = stageRuns.at(-1);
              const stageArtifacts = artifacts.filter((artifact) =>
                stageRuns.some((run) => run._id === artifact.runId),
              );
              const stageMessages = messages.filter((message) =>
                stageRuns.some((run) => run._id === message.runId),
              );
              const stageHuman = commands.filter(
                (command) =>
                  command.command.kind === "sendMessage" &&
                  command.command.stageKey === stage.key,
              );
              const stageControl =
                control.stages.find((row) => row.stageKey === stage.key) ?? null;
              const isCurrent = stage.key === job.stageKey;
              const isExpanded = expandedStageKey === stage.key;
              const stageStatus = isCurrent
                ? laneOf(job.status)
                : latestRun?.status ?? "queued";

              return (
                <article
                  className={`stage-history ${isCurrent ? "current" : ""} ${isExpanded ? "expanded" : ""}`}
                  key={stage._id}
                >
                  <button
                    className="stage-history-header"
                    type="button"
                    onClick={() => setExpandedStageKey(isExpanded ? "" : stage.key)}
                    aria-expanded={isExpanded}
                  >
                    <span className="stage-number">{index + 1}</span>
                    <span className="stage-history-name">
                      <strong>{stage.title}</strong>
                      <span className="mono muted">{stage.key}</span>
                    </span>
                    {isCurrent ? <span className="current-stage-label">Current</span> : null}
                    <Badge status={stageStatus} />
                    <span className="stage-chevron" aria-hidden="true">⌄</span>
                  </button>
                  {isExpanded ? (
                    <div className="stage-history-content">
                      <div className="stage-meta">
                        <span>{stageRuns.length} {stageRuns.length === 1 ? "Run" : "Runs"}</span>
                        {stage.halt ? <span>Human halt after this Stage</span> : null}
                        {stage.lane ? <span>{stage.lane} Lane</span> : null}
                      </div>
                      {stageControl && (stageControl.availableCommands.includes("stopStage") || stageControl.availableCommands.includes("retryStage")) ? (
                        <div className="row">
                          {stageControl.availableCommands.includes("stopStage") && stageControl.latestRunId ? (
                            <button
                              type="button"
                              className="ghost"
                              disabled={jobActionBusy}
                              onClick={() => {
                                if (!window.confirm("Stop this Stage? The Job stays open so you can retry, chat, or finish.")) return;
                                const expectedRunId = stageControl.latestRunId;
                                if (!expectedRunId) return;
                                void runJobAction("stop Stage", async () => {
                                  await dispatchCommand({
                                    jobId: id,
                                    commandId: newCommandId(),
                                    command: {
                                      kind: "stopStage",
                                      stageKey: stage.key,
                                      expectedRunId,
                                    },
                                  });
                                });
                              }}
                            >Stop Stage</button>
                          ) : null}
                          {stageControl.availableCommands.includes("retryStage") && stageControl.latestRunId ? (
                            <button
                              type="button"
                              disabled={jobActionBusy}
                              onClick={() => {
                                const expectedStoppedRunId = stageControl.latestRunId;
                                if (!expectedStoppedRunId) return;
                                void runJobAction("retry Stage", async () => {
                                  await dispatchCommand({
                                    jobId: id,
                                    commandId: newCommandId(),
                                    command: {
                                      kind: "retryStage",
                                      stageKey: stage.key,
                                      expectedStoppedRunId,
                                    },
                                  });
                                });
                              }}
                            >Retry Stage</button>
                          ) : null}
                        </div>
                      ) : null}
                      {stageRuns.length === 0 ? (
                        <p className="muted">This Stage has not started yet.</p>
                      ) : (
                        <div className="stage-runs">
                          {stageRuns.map((run) => {
                            const runArtifacts = stageArtifacts.filter((artifact) => artifact.runId === run._id);
                            const runMessages = stageMessages.filter((message) => message.runId === run._id);
                            const runAsks = asks.filter((ask) => ask.runId === run._id);
                            return (
                              <section className="stage-run" key={run._id}>
                                <div className="stage-run-head">
                                  <div className="row">
                                    <strong>Run</strong>
                                    <Badge status={run.status} />
                                    {run.agentId ? <span className="mono muted">{run.agentId}</span> : null}
                                  </div>
                                  <span className="muted">{new Date(run._creationTime).toLocaleString()}</span>
                                </div>
                                {run.error ? <p className="job-error">{run.error}</p> : null}
                                {runAsks.map((ask) => (
                                  <details className="stage-artifact" key={ask._id} open>
                                    <summary>Ask · {ask.status}</summary>
                                    <div className="stage-ask">
                                      {ask.questions.map((question) => {
                                        const response = ask.answers?.find((answer) => answer.id === question.id);
                                        return (
                                          <div key={question.id}>
                                            <strong>{question.title}</strong>
                                            <p>{question.body}</p>
                                            <p className="muted">{response ? `Answer: ${response.text}` : "Awaiting answer"}</p>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    {pendingAsk?._id === ask._id ? (
                                      <form className="stage-action stack" onSubmit={(event) => void onAnswer(event)}>
                                        {ask.questions.map((question) => (
                                          <label key={question.id}>
                                            Answer: {question.title}
                                            <textarea
                                              value={answers[question.id] ?? question.recommend}
                                              onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                                            />
                                          </label>
                                        ))}
                                        <button type="submit">Answer Ask</button>
                                      </form>
                                    ) : null}
                                  </details>
                                ))}
                                {runArtifacts.map((artifact) => (
                                  <details className="stage-artifact" key={artifact._id} open>
                                    <summary>{artifact.kind.replace(/_/g, " ")}</summary>
                                    <div className="markdown"><Markdown>{artifact.body}</Markdown></div>
                                  </details>
                                ))}
                                {runMessages.length > 0 ? (
                                  <div className="stage-agent-output">
                                    <span className="stage-output-label">Agent activity</span>
                                    <div className="log markdown"><Markdown>{renderableLog(runMessages.map((message) => message.text).join("\n\n"))}</Markdown></div>
                                  </div>
                                ) : runArtifacts.length === 0 && runAsks.length === 0 ? (
                                  <p className="muted">No agent activity has been returned yet.</p>
                                ) : null}
                              </section>
                            );
                          })}
                        </div>
                      )}
                      {stageHuman.length > 0 ? (
                        <div className="stage-agent-output">
                          <span className="stage-output-label">Your messages</span>
                          {stageHuman.map((command) =>
                            command.command.kind === "sendMessage" ? (
                              <p key={command._id}>{command.command.text}</p>
                            ) : null,
                          )}
                        </div>
                      ) : null}
                      {isCurrent && stageControl?.availableCommands.includes("sendMessage") ? (
                        <form
                          className="stage-action stack"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const text = chatDraft.trim();
                            if (text === "") return;
                            void runJobAction("send message", async () => {
                              await dispatchCommand({
                                jobId: id,
                                commandId: newCommandId(),
                                command: {
                                  kind: "sendMessage",
                                  stageKey: stage.key,
                                  text,
                                },
                              });
                              setChatDraft("");
                            });
                          }}
                        >
                          <h3>Chat with the agent</h3>
                          <p className="muted">{deliveryHint(stageControl.chatDelivery)}</p>
                          <textarea
                            value={chatDraft}
                            onChange={(event) => setChatDraft(event.target.value)}
                            placeholder="Send a note to this Stage"
                          />
                          <button type="submit" disabled={jobActionBusy || chatDraft.trim() === ""}>
                            Send
                          </button>
                        </form>
                      ) : null}
                      {isCurrent && laneOf(job.status) === "planReview" && spec ? (
                        <section className="stage-action stack">
                          <h3>Accept spec</h3>
                          {verdict ? <p className="mono muted">{verdict.body}</p> : null}
                          <div className="markdown"><Markdown>{spec.body}</Markdown></div>
                          <div className="row">
                            <button type="button" onClick={() => void acceptSpec({ jobId: id })}>Accept spec</button>
                            <input value={rejectNote} onChange={(event) => setRejectNote(event.target.value)} placeholder="Send back with a note" />
                            <button type="button" className="ghost" onClick={() => void rejectSpec({ jobId: id, note: rejectNote || "revise" })}>Send back</button>
                          </div>
                        </section>
                      ) : null}
                      {isCurrent && laneOf(job.status) === "codeReview" ? (
                        <section className="stage-action stack">
                          <h3>Code review</h3>
                          <p className="muted">Building finished. Accept to open the PR.</p>
                          <button type="button" onClick={() => void acceptCodeReview({ jobId: id })}>Accept and open PR</button>
                        </section>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

    </>
  );
}
