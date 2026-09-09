import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { canHumanFinish, laneOf, type Lane } from "./jobState";
import { markRunEnded } from "./runTiming";

export type JobCommand =
  | { kind: "stopJob" }
  | { kind: "finishJob" }
  | { kind: "stopStage"; stageKey: string; expectedRunId: Id<"runs"> }
  | { kind: "retryStage"; stageKey: string; expectedStoppedRunId: Id<"runs"> }
  | { kind: "sendMessage"; stageKey: string; text: string };

export type JobCommandKind = JobCommand["kind"];

export type MessageDelivery =
  | { kind: "queued" }
  | { kind: "taken"; runId: Id<"runs">; takenAt: number }
  | { kind: "transcriptOnly"; reason: string };

export type RunStatus = "queued" | "running" | "awaitingAsk" | "finished" | "failed";

export type JobState = {
  _id: Id<"jobs">;
  status: string;
  stageKey: string;
  runtime: "local" | "cloud";
  error?: string;
};

export type RunState = {
  _id: Id<"runs">;
  stageKey: string;
  status: RunStatus;
  endedByCommandId?: Id<"jobCommands">;
};

export type AskState = {
  _id: Id<"asks">;
  runId: Id<"runs">;
  status: "pending" | "answered" | "cancelled";
};

export type JobAggregate = {
  job: JobState;
  runs: readonly RunState[];
  asks: readonly AskState[];
};

export type JobWrite =
  | {
      kind: "patchJob";
      patch: { status?: Lane; stageKey?: string; error?: string | null };
    }
  | {
      kind: "endRun";
      runId: Id<"runs">;
      error: string;
      endedByCommandId?: Id<"jobCommands">;
    }
  | { kind: "finishRun"; runId: Id<"runs"> }
  | { kind: "cancelAsk"; askId: Id<"asks"> }
  | { kind: "enqueueRun"; stageKey: string }
  | { kind: "setDelivery"; delivery: MessageDelivery };

export type UnchangedReason =
  | "duplicate"
  | "alreadyTerminal"
  | "alreadyStopped"
  | "notStopped"
  | "superseded";

export type CommandPlan = {
  receipt:
    | { kind: "applied" }
    | { kind: "unchanged"; reason: UnchangedReason };
  writes: readonly JobWrite[];
};

export type WorkerResult =
  | { kind: "finished" }
  | { kind: "failed"; error: string };

export type SettleRunPlan =
  | { kind: "unchanged"; reason: string }
  | { kind: "advance" }
  | { kind: "apply"; writes: readonly JobWrite[] };

export const STOPPED_BY_USER = "Stopped by user";
export const FINISHED_BY_USER = "Finished by user";
export const MAX_MESSAGE_LENGTH = 4000;

export function isActiveRun(status: string): boolean {
  return status === "queued" || status === "running" || status === "awaitingAsk";
}

export function toAggregate(
  job: Pick<Doc<"jobs">, "_id" | "status" | "stageKey" | "runtime" | "error">,
  runs: readonly Pick<
    Doc<"runs">,
    "_id" | "stageKey" | "status" | "endedByCommandId"
  >[],
  asks: readonly Pick<Doc<"asks">, "_id" | "runId" | "status">[],
): JobAggregate {
  return {
    job: {
      _id: job._id,
      status: job.status,
      stageKey: job.stageKey,
      runtime: job.runtime,
      error: job.error,
    },
    runs: runs.map((run) => ({
      _id: run._id,
      stageKey: run.stageKey,
      status: run.status,
      endedByCommandId: run.endedByCommandId,
    })),
    asks: asks.map((ask) => ({
      _id: ask._id,
      runId: ask.runId,
      status: ask.status,
    })),
  };
}

function cancelAsksOf(
  asks: readonly AskState[],
  runId: Id<"runs">,
): JobWrite[] {
  return asks
    .filter((ask) => ask.runId === runId && ask.status === "pending")
    .map((ask) => ({ kind: "cancelAsk" as const, askId: ask._id }));
}

function endRuns(
  runs: readonly RunState[],
  asks: readonly AskState[],
  error: string,
  commandId: Id<"jobCommands">,
): JobWrite[] {
  const writes: JobWrite[] = [];
  for (const run of runs) {
    writes.push({
      kind: "endRun",
      runId: run._id,
      error,
      endedByCommandId: commandId,
    });
    writes.push(...cancelAsksOf(asks, run._id));
  }
  return writes;
}

export function applyJobCommand(
  aggregate: JobAggregate,
  command: JobCommand,
  commandRowId: Id<"jobCommands">,
): CommandPlan {
  const { job, runs, asks } = aggregate;
  const lane = laneOf(job.status);
  const active = runs.filter((run) => isActiveRun(run.status));

  switch (command.kind) {
    case "stopJob": {
      if (active.length === 0 && (lane === "failed" || lane === "pr")) {
        return { receipt: { kind: "unchanged", reason: "alreadyTerminal" }, writes: [] };
      }
      const writes = endRuns(active, asks, STOPPED_BY_USER, commandRowId);
      if (lane !== "failed" && lane !== "pr") {
        writes.push({
          kind: "patchJob",
          patch: { status: "failed", error: STOPPED_BY_USER },
        });
      }
      return { receipt: { kind: "applied" }, writes };
    }

    case "finishJob": {
      if (!canHumanFinish(job.status)) {
        return { receipt: { kind: "unchanged", reason: "alreadyTerminal" }, writes: [] };
      }
      const writes = endRuns(active, asks, FINISHED_BY_USER, commandRowId);
      writes.push({ kind: "patchJob", patch: { status: "pr", error: null } });
      return { receipt: { kind: "applied" }, writes };
    }

    case "stopStage": {
      const expected = runs.find((run) => run._id === command.expectedRunId);
      if (!expected) throw new Error("Run not found on this Job");
      if (expected.stageKey !== command.stageKey) {
        throw new Error("Run does not belong to that Stage");
      }
      if (!isActiveRun(expected.status)) {
        return { receipt: { kind: "unchanged", reason: "alreadyStopped" }, writes: [] };
      }
      const stageRuns = active.filter((run) => run.stageKey === command.stageKey);
      return {
        receipt: { kind: "applied" },
        writes: endRuns(stageRuns, asks, STOPPED_BY_USER, commandRowId),
      };
    }

    case "retryStage": {
      if (lane === "pr" || lane === "failed") {
        throw new Error("A finished Job cannot retry a Stage");
      }
      if (command.stageKey !== job.stageKey) {
        throw new Error("Only the current Stage can be retried");
      }
      const expected = runs.find((run) => run._id === command.expectedStoppedRunId);
      if (!expected) throw new Error("Run not found on this Job");
      if (expected.stageKey !== command.stageKey) {
        throw new Error("Run does not belong to that Stage");
      }
      const stageRuns = runs.filter((run) => run.stageKey === command.stageKey);
      if (stageRuns[stageRuns.length - 1]?._id !== expected._id) {
        return { receipt: { kind: "unchanged", reason: "superseded" }, writes: [] };
      }
      if (isActiveRun(expected.status)) {
        return { receipt: { kind: "unchanged", reason: "notStopped" }, writes: [] };
      }
      if (expected.status !== "failed" || !expected.endedByCommandId) {
        throw new Error("Retry needs a Stage that a human stopped");
      }
      if (active.some((run) => run.stageKey === command.stageKey)) {
        return { receipt: { kind: "unchanged", reason: "notStopped" }, writes: [] };
      }
      return {
        receipt: { kind: "applied" },
        writes: [{ kind: "enqueueRun", stageKey: command.stageKey }],
      };
    }

    case "sendMessage": {
      const text = command.text.trim();
      if (text === "") throw new Error("Message is required");
      if (text.length > MAX_MESSAGE_LENGTH) {
        throw new Error(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer`);
      }
      const delivery: MessageDelivery =
        active.length > 0 || (lane !== "pr" && lane !== "failed")
          ? { kind: "queued" }
          : { kind: "transcriptOnly", reason: "The Job has no further Runs" };
      return {
        receipt: { kind: "applied" },
        writes: [{ kind: "setDelivery", delivery }],
      };
    }
  }
}

export function settleRun(
  aggregate: JobAggregate,
  runId: Id<"runs">,
  result: WorkerResult,
): SettleRunPlan {
  const run = aggregate.runs.find((row) => row._id === runId);
  if (!run) return { kind: "unchanged", reason: "Run not found" };
  if (!isActiveRun(run.status)) {
    return { kind: "unchanged", reason: "Run already ended" };
  }
  const lane = laneOf(aggregate.job.status);
  if (result.kind === "finished") {
    if (lane === "failed") {
      return {
        kind: "apply",
        writes: [{ kind: "finishRun", runId }],
      };
    }
    if (lane === "pr") {
      return {
        kind: "apply",
        writes: [{ kind: "finishRun", runId }],
      };
    }
    return { kind: "advance" };
  }
  if (lane === "pr" || lane === "failed") {
    return {
      kind: "apply",
      writes: [{ kind: "endRun", runId, error: result.error }],
    };
  }
  return {
    kind: "apply",
    writes: [
      { kind: "endRun", runId, error: result.error },
      { kind: "patchJob", patch: { status: "failed", error: result.error } },
    ],
  };
}

export async function applyJobWrites(
  ctx: MutationCtx,
  job: Doc<"jobs">,
  writes: readonly JobWrite[],
  commandRowId?: Id<"jobCommands">,
): Promise<void> {
  for (const write of writes) {
    switch (write.kind) {
      case "patchJob": {
        const patch: {
          status?: Lane;
          stageKey?: string;
          error?: string;
        } = {};
        if (write.patch.status !== undefined) patch.status = write.patch.status;
        if (write.patch.stageKey !== undefined) patch.stageKey = write.patch.stageKey;
        if (write.patch.error === null) {
          await ctx.db.patch(job._id, { ...patch, error: undefined });
        } else {
          if (write.patch.error !== undefined) patch.error = write.patch.error;
          await ctx.db.patch(job._id, patch);
        }
        break;
      }
      case "endRun": {
        await ctx.db.patch(write.runId, {
          status: "failed",
          error: write.error,
          ...(write.endedByCommandId
            ? { endedByCommandId: write.endedByCommandId }
            : {}),
        });
        const ended = await ctx.db.get(write.runId);
        if (ended) await markRunEnded(ctx, ended);
        break;
      }
      case "finishRun": {
        await ctx.db.patch(write.runId, { status: "finished" });
        const finished = await ctx.db.get(write.runId);
        if (finished) await markRunEnded(ctx, finished);
        break;
      }
      case "cancelAsk":
        await ctx.db.patch(write.askId, { status: "cancelled" });
        break;
      case "enqueueRun":
        await ctx.db.insert("runs", {
          jobId: job._id,
          stageKey: write.stageKey,
          status: "queued",
          runtime: job.runtime,
          grillAttached: false,
        });
        break;
      case "setDelivery":
        if (!commandRowId) throw new Error("setDelivery needs a command row");
        await ctx.db.patch(commandRowId, { delivery: write.delivery });
        break;
    }
  }
}

export type ChatDelivery = "pollBetweenTurns" | "nextRun" | "transcriptOnly";

export type StageControlView = {
  stageKey: string;
  latestRunId: Id<"runs"> | null;
  availableCommands: JobCommandKind[];
  chatDelivery: ChatDelivery;
};

export function chatDeliveryFor(provider?: string): ChatDelivery {
  return provider === "openai" ? "pollBetweenTurns" : "nextRun";
}

export function deriveStageControl(
  aggregate: JobAggregate,
  stageKey: string,
  provider?: string,
): StageControlView {
  const { job, runs } = aggregate;
  const lane = laneOf(job.status);
  const terminal = lane === "pr" || lane === "failed";
  const stageRuns = runs.filter((run) => run.stageKey === stageKey);
  const latest = stageRuns[stageRuns.length - 1] ?? null;
  const isCurrent = stageKey === job.stageKey;
  const availableCommands: JobCommandKind[] = [];
  if (latest && isActiveRun(latest.status)) availableCommands.push("stopStage");
  if (
    isCurrent &&
    !terminal &&
    latest?.status === "failed" &&
    latest.endedByCommandId
  ) {
    availableCommands.push("retryStage");
  }
  if (isCurrent && !terminal) availableCommands.push("sendMessage");
  const anyActive = runs.some((run) => isActiveRun(run.status));
  return {
    stageKey,
    latestRunId: latest?._id ?? null,
    availableCommands,
    chatDelivery:
      terminal && !anyActive ? "transcriptOnly" : chatDeliveryFor(provider),
  };
}

export type JobActivity =
  | "working"
  | "waitingOnHuman"
  | "parked"
  | "done"
  | "failed";

export function jobActivity(aggregate: JobAggregate): JobActivity {
  const lane = laneOf(aggregate.job.status);
  if (lane === "pr") return "done";
  if (lane === "failed") return "failed";
  if (aggregate.runs.some((run) => run.status === "awaitingAsk")) {
    return "waitingOnHuman";
  }
  if (lane === "needsDetail" || lane === "planReview" || lane === "codeReview") {
    return "waitingOnHuman";
  }
  if (
    aggregate.runs.some(
      (run) => run.status === "queued" || run.status === "running",
    )
  ) {
    return "working";
  }
  return "parked";
}

export function deriveControlView(
  aggregate: JobAggregate,
  stages: readonly { key: string; provider?: string }[],
): {
  activity: JobActivity;
  availableCommands: JobCommandKind[];
  stages: StageControlView[];
} {
  const lane = laneOf(aggregate.job.status);
  const availableCommands: JobCommandKind[] = [];
  if (lane !== "pr") availableCommands.push("finishJob");
  if (aggregate.runs.some((run) => isActiveRun(run.status))) {
    availableCommands.push("stopJob");
  }
  return {
    activity: jobActivity(aggregate),
    availableCommands,
    stages: stages.map((stage) =>
      deriveStageControl(aggregate, stage.key, stage.provider),
    ),
  };
}
