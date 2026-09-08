/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  applyJobCommand,
  settleRun,
  STOPPED_BY_USER,
  toAggregate,
} from "./lib/jobControl";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function setupJob() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const projectId = await ctx.db.insert("projects", {
      name: "Test",
      kind: "web",
      localPath: "/tmp/test",
      githubRepo: "owner/repo",
      defaultRuntime: "local",
    });
    const recipeId = await ctx.db.insert("recipes", {
      name: "Test",
      slug: "test",
      model: "test-model",
    });
    await ctx.db.insert("stages", {
      recipeId,
      title: "Build",
      key: "build",
      order: 0,
    });
    const jobId = await ctx.db.insert("jobs", {
      projectId,
      recipeId,
      request: "Build it",
      runtime: "local",
      forceGrill: false,
      status: "building",
      stageKey: "build",
    });
    const runId = await ctx.db.insert("runs", {
      jobId,
      stageKey: "build",
      status: "running",
      runtime: "local",
      grillAttached: false,
    });
    const askId = await ctx.db.insert("asks", {
      runId,
      jobId,
      kind: "generic",
      questions: [],
      status: "pending",
    });
    const artifactId = await ctx.db.insert("artifacts", {
      runId,
      jobId,
      kind: "spec",
      body: "spec",
    });
    const messageId = await ctx.db.insert("runMessages", {
      runId,
      jobId,
      text: "working",
      createdAt: Date.now(),
    });
    return { jobId, runId, askId, artifactId, messageId };
  });
  return { t, ...ids };
}

test("stopping a Job terminates active Runs and prevents Workflow advancement", async () => {
  const { t, jobId, runId } = await setupJob();
  await t.mutation(api.jobs.stop, { jobId });
  expect(await t.query(api.worker.getRunStatus, { runId })).toBe("failed");
  expect((await t.query(api.jobs.get, { jobId }))?.job).toMatchObject({
    status: "failed",
    error: "Stopped by user",
  });
  await t.mutation(api.worker.finishStage, { runId, status: "finished" });
  expect(await t.query(api.worker.getRunStatus, { runId })).toBe("failed");
});

test("deleting a Job removes its Runs, Asks, artifacts, and activity", async () => {
  const { t, jobId, runId, askId, artifactId, messageId } = await setupJob();
  await t.mutation(api.jobs.remove, { jobId });
  expect(await t.query(api.jobs.get, { jobId })).toBeNull();
  expect(await t.run((ctx) => Promise.all([
    ctx.db.get(runId),
    ctx.db.get(askId),
    ctx.db.get(artifactId),
    ctx.db.get(messageId),
  ]))).toEqual([null, null, null, null]);
});

test("stopStage leaves the Job live and blocks late finishStage", async () => {
  const { t, jobId, runId } = await setupJob();
  await t.mutation(api.jobs.dispatchCommand, {
    jobId,
    commandId: "stop-stage-1",
    command: { kind: "stopStage", stageKey: "build", expectedRunId: runId },
  });
  const view = await t.query(api.jobs.get, { jobId });
  expect(view?.job.status).toBe("building");
  expect(view?.runs[0]).toMatchObject({
    status: "failed",
    error: STOPPED_BY_USER,
  });
  expect(view?.pendingAsk).toBeNull();
  await t.mutation(api.worker.finishStage, { runId, status: "finished" });
  expect((await t.query(api.jobs.get, { jobId }))?.job.status).toBe("building");
});

test("late failRun after stopStage does not fail the Job", async () => {
  const { t, jobId, runId } = await setupJob();
  await t.mutation(api.jobs.dispatchCommand, {
    jobId,
    commandId: "stop-stage-2",
    command: { kind: "stopStage", stageKey: "build", expectedRunId: runId },
  });
  await t.mutation(api.worker.failRun, { runId, error: "child exited" });
  expect((await t.query(api.jobs.get, { jobId }))?.job.status).toBe("building");
});

test("finishJob moves the Job to pr", async () => {
  const { t, jobId, runId } = await setupJob();
  await t.mutation(api.jobs.dispatchCommand, {
    jobId,
    commandId: "finish-1",
    command: { kind: "finishJob" },
  });
  const view = await t.query(api.jobs.get, { jobId });
  expect(view?.job.status).toBe("pr");
  expect(view?.runs[0]?.status).toBe("failed");
  expect(await t.query(api.worker.getRunStatus, { runId })).toBe("failed");
});

test("retryStage enqueues after a commanded stop", async () => {
  const { t, jobId, runId } = await setupJob();
  await t.mutation(api.jobs.dispatchCommand, {
    jobId,
    commandId: "stop-stage-3",
    command: { kind: "stopStage", stageKey: "build", expectedRunId: runId },
  });
  await t.mutation(api.jobs.dispatchCommand, {
    jobId,
    commandId: "retry-1",
    command: {
      kind: "retryStage",
      stageKey: "build",
      expectedStoppedRunId: runId,
    },
  });
  const view = await t.query(api.jobs.get, { jobId });
  expect(view?.runs).toHaveLength(2);
  expect(view?.runs[1]?.status).toBe("queued");
});

test("applyJobCommand rejects a stale stopStage expectedRunId", () => {
  const jobId = "j1" as Id<"jobs">;
  const runA = "r1" as Id<"runs">;
  const runB = "r2" as Id<"runs">;
  const commandId = "c1" as Id<"jobCommands">;
  const aggregate = toAggregate(
    {
      _id: jobId,
      status: "building",
      stageKey: "build",
      runtime: "local",
    },
    [
      {
        _id: runA,
        stageKey: "build",
        status: "failed",
        endedByCommandId: commandId,
      },
      {
        _id: runB,
        stageKey: "build",
        status: "running",
      },
    ],
    [],
  );
  const plan = applyJobCommand(
    aggregate,
    { kind: "stopStage", stageKey: "build", expectedRunId: runA },
    commandId,
  );
  expect(plan.receipt).toEqual({ kind: "unchanged", reason: "alreadyStopped" });
});

test("settleRun does not advance a finished Job", () => {
  const jobId = "j1" as Id<"jobs">;
  const runId = "r1" as Id<"runs">;
  const aggregate = toAggregate(
    {
      _id: jobId,
      status: "pr",
      stageKey: "build",
      runtime: "local",
    },
    [
      {
        _id: runId,
        stageKey: "build",
        status: "running",
      },
    ],
    [],
  );
  expect(settleRun(aggregate, runId, { kind: "finished" })).toEqual({
    kind: "apply",
    writes: [{ kind: "finishRun", runId }],
  });
});
