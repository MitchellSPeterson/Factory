import { useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { laneOf } from "../../convex/lib/jobState";
import { Badge } from "../status";
import { formatUsageIO } from "../formatTokens";
import { formatDuration, jobDurationMs, runDurationMs } from "../formatDuration";
import { ContextMeter } from "../ContextViewer";
import { latestAgentContext, modelContextWindow, type ContextBreakdown } from "../contextSegments";
import { stageTitle } from "../jobsBoard";
import {
  formatJobActivity,
  formatPlanVerdictLabel,
  hideArtifactInStage,
  jobNeed,
  jobNeedHeading,
  type JobNeed,
} from "../jobNeed";

function renderableLog(text: string): string {
  const fences = (text.match(/^```/gm) ?? []).length;
  return fences % 2 === 1 ? `${text}\n\`\`\`` : text;
}

function AgentLog({ text, live }: { text: string; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!live || !ref.current) return;
    ref.current.scrollTop = ref.current.scrollHeight;
  }, [text, live]);
  return (
    <div ref={ref} className={`log markdown${live ? " live" : ""}`}>
      {text !== "" ? <Markdown>{renderableLog(text)}</Markdown> : live ? <p className="muted">Streaming…</p> : null}
    </div>
  );
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

  if (view === undefined) {
    return (
      <div className="job-page" aria-busy="true" aria-label="Loading Job">
        <p className="crumb muted">Jobs</p>
        <div className="pagehead">
          <div>
            <span className="skel skel-title" />
            <span className="skel skel-chip" />
          </div>
        </div>
        <div className="job-need job-need-skeleton" aria-hidden="true">
          <span className="skel skel-title" />
          <span className="skel skel-meta" />
          <span className="skel skel-sm" />
        </div>
      </div>
    );
  }
  if (view === null) {
    return (
      <>
        <p className="crumb">
          <Link to="/jobs">Jobs</Link>
        </p>
        <div className="pagehead">
          <div>
            <h1>Job not found</h1>
            <p className="muted">That Job is gone, or the link is wrong.</p>
          </div>
        </div>
        <p>
          <Link to="/jobs">Back to Jobs</Link>
        </p>
      </>
    );
  }

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
  const jobTime = formatDuration(jobDurationMs(job, runs));
  const jobUsage = formatUsageIO(job.usage);
  const lane = laneOf(job.status);
  const need = jobNeed({ status: job.status, hasPendingAsk: pendingAsk !== null });
  const currentStage = control.stages.find((row) => row.stageKey === job.stageKey) ?? null;

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
        <Link to="/jobs">Jobs</Link>
        {" / "}
        <Link to={`/projects/${project._id}`}>{project.name}</Link>
      </p>
      <div className="pagehead">
        <div>
          <h1 className="job-heading">{job.request}</h1>
          <div className="job-status-row">
            <Badge status={lane} />
            <span className="muted">{stageTitle(job.stageKey)}</span>
            <span className="muted">{formatJobActivity(control.activity)}</span>
            {jobTime ? <span className="muted">{jobTime}</span> : null}
            {jobUsage ? <span className="muted">{jobUsage}</span> : null}
            <Link className="job-status-link" to={`/workflows/${job.recipeId}`}>
              {recipeName}
            </Link>
            {job.githubIssueUrl ? (
              <a className="job-status-link" href={job.githubIssueUrl} target="_blank" rel="noreferrer">
                GitHub issue
              </a>
            ) : null}
            {job.milestone ? <span className="muted">Milestone: {job.milestone}</span> : null}
            {job.tags?.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        </div>
        <div className="row job-chrome-actions">
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
            >
              Finish Job
            </button>
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
            >
              Stop Job
            </button>
          ) : null}
          <button
            type="button"
            className="danger-button"
            disabled={jobActionBusy}
            onClick={() => {
              if (
                !window.confirm(
                  "Delete this Job and all of its Runs, Asks, artifacts, and activity? Any active Run will be stopped.",
                )
              ) {
                return;
              }
              void runJobAction("delete Job", async () => {
                await removeJob({ jobId: id });
                navigate("/jobs");
              });
            }}
          >
            Delete Job
          </button>
        </div>
      </div>
      {jobActionError ? (
        <p role="alert" className="error">
          {jobActionError}
        </p>
      ) : null}

      {need !== "none" ? (
        <section className={`job-need job-need-${need}`} aria-labelledby="job-need-title">
          <div>
            <h2 id="job-need-title">{jobNeedHeading(need)}</h2>
            {need === "ask" ? (
              <p className="job-need-lead">The agent asked. Answer to continue this Job.</p>
            ) : null}
            {need === "planReview" ? (
              <p className="job-need-lead">
                {verdict
                  ? `${formatPlanVerdictLabel(verdict.body) ?? "Review the spec"}. Accept to continue Building, or send it back with a note.`
                  : "Review the spec. Accept to continue Building, or send it back with a note."}
              </p>
            ) : null}
            {need === "codeReview" ? (
              <p className="job-need-lead">Building finished. Accept to open the PR.</p>
            ) : null}
            {need === "failed" ? (
              <p className="job-need-lead">{job.error ?? "The last Run failed."}</p>
            ) : null}
          </div>

          {need === "ask" && pendingAsk ? (
            <form className="stack" onSubmit={(event) => void onAnswer(event)}>
              {pendingAsk.questions.map((question) => (
                <label key={question.id}>
                  {question.title}
                  <span className="job-need-hint">{question.body}</span>
                  <textarea
                    value={answers[question.id] ?? question.recommend}
                    onChange={(event) =>
                      setAnswers((current) => ({ ...current, [question.id]: event.target.value }))
                    }
                  />
                </label>
              ))}
              <button type="submit">Answer Ask</button>
            </form>
          ) : null}

          {need === "planReview" ? (
            <div className="job-need-actions">
              <button
                type="button"
                disabled={jobActionBusy || !spec}
                onClick={() =>
                  void runJobAction("accept spec", async () => {
                    await acceptSpec({ jobId: id });
                  })
                }
              >
                Accept spec
              </button>
              <input
                value={rejectNote}
                onChange={(event) => setRejectNote(event.target.value)}
                placeholder="Send back with a note"
                aria-label="Send back with a note"
              />
              <button
                type="button"
                className="ghost"
                disabled={jobActionBusy}
                onClick={() =>
                  void runJobAction("send spec back", async () => {
                    await rejectSpec({ jobId: id, note: rejectNote || "revise" });
                  })
                }
              >
                Send back
              </button>
            </div>
          ) : null}

          {need === "planReview" && spec ? (
            <div className="markdown job-need-spec">
              <Markdown>{spec.body}</Markdown>
            </div>
          ) : null}
          {need === "planReview" && !spec ? <p>The spec is not in yet.</p> : null}

          {need === "codeReview" ? (
            <div className="job-need-actions">
              <button
                type="button"
                disabled={jobActionBusy}
                onClick={() =>
                  void runJobAction("accept code review", async () => {
                    await acceptCodeReview({ jobId: id });
                  })
                }
              >
                Accept and open PR
              </button>
            </div>
          ) : null}

          {need === "failed" && currentStage?.availableCommands.includes("retryStage") && currentStage.latestRunId ? (
            <div className="job-need-actions">
              <button
                type="button"
                disabled={jobActionBusy}
                onClick={() => {
                  const expectedStoppedRunId = currentStage.latestRunId;
                  if (!expectedStoppedRunId) return;
                  void runJobAction("retry Stage", async () => {
                    await dispatchCommand({
                      jobId: id,
                      commandId: newCommandId(),
                      command: {
                        kind: "retryStage",
                        stageKey: job.stageKey,
                        expectedStoppedRunId,
                      },
                    });
                  });
                }}
              >
                Retry Stage
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="workflow-history" aria-labelledby="workflow-history-title">
        <div className="section-heading">
          <div>
            <h2 id="workflow-history-title">Workflow</h2>
            <p>Open a Stage for its Runs, log, and chat.</p>
          </div>
          <span className="muted">Current: {stageTitle(job.stageKey)}</span>
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
                (command) => command.command.kind === "sendMessage" && command.command.stageKey === stage.key,
              );
              const stageControl = control.stages.find((row) => row.stageKey === stage.key) ?? null;
              const isCurrent = stage.key === job.stageKey;
              const isExpanded = expandedStageKey === stage.key;
              const stageStatus = isCurrent ? lane : (latestRun?.status ?? "queued");
              const agentContext = latestAgentContext(stageRuns);

              return (
                <article
                  className={`stage-history ${isCurrent ? "current" : ""} ${isExpanded ? "expanded" : ""}`}
                  key={stage._id}
                >
                  <div className="stage-history-top">
                    <button
                      className="stage-history-header"
                      type="button"
                      onClick={() => setExpandedStageKey(isExpanded ? "" : stage.key)}
                      aria-expanded={isExpanded}
                    >
                      <span className="stage-number">{index + 1}</span>
                      <span className="stage-history-name">
                        <strong>{stage.title}</strong>
                        <span className="muted">{stageTitle(stage.key)}</span>
                      </span>
                      {isCurrent ? <span className="current-stage-label">Current</span> : null}
                      <Badge status={stageStatus} />
                      <span className="stage-chevron" aria-hidden="true" />
                    </button>
                    {agentContext ? (
                      <ContextMeter
                        breakdown={agentContext.contextBreakdown}
                        usage={agentContext.usage}
                        windowTokens={modelContextWindow(stage.model ?? workflow.model)}
                      />
                    ) : null}
                  </div>
                  {isExpanded ? (
                    <StageBody
                      halt={stage.halt}
                      laneName={stage.lane}
                      stageRuns={stageRuns}
                      stageArtifacts={stageArtifacts}
                      stageMessages={stageMessages}
                      stageHuman={stageHuman}
                      asks={asks}
                      pendingAskId={pendingAsk?._id}
                      need={need}
                      isCurrent={isCurrent}
                      stageControl={stageControl}
                      jobActionBusy={jobActionBusy}
                      chatDraft={chatDraft}
                      setChatDraft={setChatDraft}
                      onStopStage={(expectedRunId) => {
                        if (!window.confirm("Stop this Stage? The Job stays open so you can retry, chat, or finish.")) {
                          return;
                        }
                        void runJobAction("stop Stage", async () => {
                          await dispatchCommand({
                            jobId: id,
                            commandId: newCommandId(),
                            command: { kind: "stopStage", stageKey: stage.key, expectedRunId },
                          });
                        });
                      }}
                      onRetryStage={(expectedStoppedRunId) => {
                        void runJobAction("retry Stage", async () => {
                          await dispatchCommand({
                            jobId: id,
                            commandId: newCommandId(),
                            command: { kind: "retryStage", stageKey: stage.key, expectedStoppedRunId },
                          });
                        });
                      }}
                      onSendChat={() => {
                        const text = chatDraft.trim();
                        if (text === "") return;
                        void runJobAction("send message", async () => {
                          await dispatchCommand({
                            jobId: id,
                            commandId: newCommandId(),
                            command: { kind: "sendMessage", stageKey: stage.key, text },
                          });
                          setChatDraft("");
                        });
                      }}
                    />
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

function StageBody({
  halt,
  laneName,
  stageRuns,
  stageArtifacts,
  stageMessages,
  stageHuman,
  asks,
  pendingAskId,
  need,
  isCurrent,
  stageControl,
  jobActionBusy,
  chatDraft,
  setChatDraft,
  onStopStage,
  onRetryStage,
  onSendChat,
}: {
  halt?: boolean;
  laneName?: string;
  stageRuns: Array<{
    _id: Id<"runs">;
    status: string;
    agentId?: string;
    _creationTime: number;
    error?: string | null;
    usage?: { inputTokens: number; outputTokens: number; totalTokens?: number };
    contextBreakdown?: ContextBreakdown | null;
    startedAt?: number;
    endedAt?: number;
    durationMs?: number;
  }>;
  stageArtifacts: Array<{ _id: string; kind: string; body: string; runId: Id<"runs"> }>;
  stageMessages: Array<{ _id: string; text: string; runId: Id<"runs"> }>;
  stageHuman: Array<{ _id: string; command: { kind: string; text?: string } }>;
  asks: Array<{
    _id: string;
    runId: Id<"runs">;
    status: string;
    questions: Array<{ id: string; title: string; body: string; recommend: string }>;
    answers?: Array<{ id: string; text: string }>;
  }>;
  pendingAskId?: string;
  need: JobNeed;
  isCurrent: boolean;
  stageControl: {
    latestRunId: Id<"runs"> | null;
    availableCommands: string[];
    chatDelivery: "pollBetweenTurns" | "nextRun" | "transcriptOnly";
  } | null;
  jobActionBusy: boolean;
  chatDraft: string;
  setChatDraft: (value: string) => void;
  onStopStage: (expectedRunId: Id<"runs">) => void;
  onRetryStage: (expectedStoppedRunId: Id<"runs">) => void;
  onSendChat: () => void;
}) {
  const stageMs = stageRuns.reduce((sum, run) => sum + (runDurationMs(run) ?? 0), 0);
  const durationLabel = formatDuration(stageMs > 0 ? stageMs : null);
  const stageUsage = stageRuns.reduce(
    (acc, run) => ({
      inputTokens: acc.inputTokens + (run.usage?.inputTokens ?? 0),
      outputTokens: acc.outputTokens + (run.usage?.outputTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0 },
  );
  const usageLabel = formatUsageIO(stageUsage);
  const stopRunId = stageControl?.availableCommands.includes("stopStage") ? stageControl.latestRunId : null;
  const retryRunId =
    need !== "failed" && stageControl?.availableCommands.includes("retryStage")
      ? stageControl.latestRunId
      : null;

  return (
    <div className="stage-history-content">
      <div className="stage-meta">
        <span>
          {stageRuns.length} {stageRuns.length === 1 ? "Run" : "Runs"}
        </span>
        {durationLabel ? <span>{durationLabel}</span> : null}
        {usageLabel ? <span>{usageLabel}</span> : null}
        {halt ? <span>Human halt after this Stage</span> : null}
        {laneName ? <span>{laneName} Lane</span> : null}
      </div>
      {stopRunId || retryRunId ? (
        <div className="row">
          {stopRunId ? (
            <button
              type="button"
              className="ghost"
              disabled={jobActionBusy}
              onClick={() => onStopStage(stopRunId)}
            >
              Stop Stage
            </button>
          ) : null}
          {retryRunId ? (
            <button type="button" disabled={jobActionBusy} onClick={() => onRetryStage(retryRunId)}>
              Retry Stage
            </button>
          ) : null}
        </div>
      ) : null}
      {stageRuns.length === 0 ? (
        <p className="muted">This Stage has not started yet.</p>
      ) : (
        <div className="stage-runs">
          {stageRuns.map((run) => {
            const runArtifacts = stageArtifacts.filter(
              (artifact) => artifact.runId === run._id && !hideArtifactInStage(artifact.kind, need),
            );
            const runMessages = stageMessages.filter((message) => message.runId === run._id);
            const runAsks = asks.filter((ask) => ask.runId === run._id && ask._id !== pendingAskId);
            return (
              <section className="stage-run" key={run._id}>
                <div className="stage-run-head">
                  <div className="row">
                    <strong>Run</strong>
                    <Badge status={run.status} />
                    {run.agentId ? <span className="mono muted">{run.agentId}</span> : null}
                    {formatDuration(runDurationMs(run)) ? (
                      <span className="muted">{formatDuration(runDurationMs(run))}</span>
                    ) : null}
                    {formatUsageIO(run.usage) ? <span className="muted">{formatUsageIO(run.usage)}</span> : null}
                  </div>
                  <span className="muted">{new Date(run._creationTime).toLocaleString()}</span>
                </div>
                {run.error ? <p className="job-error">{run.error}</p> : null}
                {runAsks.map((ask) => (
                  <details className="stage-artifact" key={ask._id}>
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
                  </details>
                ))}
                {runArtifacts.map((artifact) => (
                  <details className="stage-artifact" key={artifact._id}>
                    <summary>{artifact.kind.replace(/_/g, " ")}</summary>
                    <div className="markdown">
                      <Markdown>{artifact.body}</Markdown>
                    </div>
                  </details>
                ))}
                {runMessages.length > 0 || run.status === "running" ? (
                  <div className="stage-agent-output">
                    <span className="stage-output-label">Agent activity</span>
                    <AgentLog
                      text={runMessages.map((message) => message.text).join("\n\n")}
                      live={run.status === "running"}
                    />
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
            command.command.kind === "sendMessage" ? <p key={command._id}>{command.command.text}</p> : null,
          )}
        </div>
      ) : null}
      {isCurrent && stageControl?.availableCommands.includes("sendMessage") ? (
        <form
          className="stage-action stack"
          onSubmit={(event) => {
            event.preventDefault();
            onSendChat();
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
    </div>
  );
}
