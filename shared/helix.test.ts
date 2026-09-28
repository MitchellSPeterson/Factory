import { expect, test } from "bun:test";
import { advance, MAX_ATTEMPTS, parsePlan, parseVerdict, type BuildEvent, type BuildFields } from "./helix";

const agent = { provider: "claude" as const, model: "m", effort: "high" as const };
const base = (over: Partial<BuildFields> = {}): BuildFields => ({
  projectId: "p",
  roadmapItemId: "r",
  title: "Rotation",
  branch: "build/rotation",
  checkCommand: "bun test",
  agent,
  reviewers: [agent, agent],
  notes: [],
  checkpoints: [],
  current: 0,
  step: { kind: "plan" },
  started: false,
  sessionIds: [],
  status: "running",
  ...over,
});
const run = (b: BuildFields, ...events: BuildEvent[]) => events.reduce(advance, b);
const plan = [
  { title: "One", description: "a", tests: "rotates", ui: false },
  { title: "Two", description: "b", tests: "shows it", ui: true, prototype: "prototypes/rotation/2.html" },
];
const ok: BuildEvent = { kind: "reviewed", verdicts: [{ approve: true, findings: [] }, { approve: true, findings: [] }] };
const pass: BuildEvent = { kind: "checked", pass: true, output: "" };
const approved = (b: BuildFields) => run(b, { kind: "planned", checkpoints: plan }, { kind: "planApproved", checkpoints: plan });

test("a Build writes tests first, walks every Gate, and waits for you only at the plan and the end", () => {
  let b = run(base(), { kind: "planned", checkpoints: plan });
  expect(b.step.kind).toBe("approvePlan");
  expect(b.status).toBe("waiting");
  b = run(b, { kind: "planApproved", checkpoints: plan });
  expect(b.step.kind).toBe("writeTests");
  b = run(b, { kind: "testsWritten" });
  expect(b.step).toEqual({ kind: "implement", message: "" });
  b = run(b, { kind: "implemented" }, pass);
  // Checkpoint One has no UI, so it goes straight to the Review Gate.
  expect(b.step.kind).toBe("review");
  b = run(b, ok);
  expect(b.checkpoints[0]!.gates).toEqual({ behavior: "pass", ui: "skipped", review: "pass" });
  expect(b.step.kind).toBe("commit");
  expect(b.status).toBe("running");
  b = run(b, { kind: "committed", sha: "abc" });
  expect(b.checkpoints[0]!.commit).toBe("abc");
  expect(b.current).toBe(1);
  b = run(b, { kind: "testsWritten" }, { kind: "implemented" }, pass);
  expect(b.step.kind).toBe("uiReview");
  b = run(b, ok);
  expect(b.step.kind).toBe("review");
  b = run(b, ok, { kind: "committed", sha: "def" });
  expect(b.checkpoints[1]!.gates).toEqual({ behavior: "pass", ui: "pass", review: "pass" });
  expect(b.step.kind).toBe("finalReview");
  expect(b.status).toBe("waiting");
  b = run(b, { kind: "approved" });
  expect(b.status).toBe("done");
});

test("no check command skips the test writer and the Behavior Gate", () => {
  let b = approved(base({ checkCommand: "" }));
  expect(b.step).toEqual({ kind: "implement", message: "" });
  b = run(b, { kind: "implemented" }, pass);
  expect(b.checkpoints[0]!.gates.behavior).toBe("skipped");
});

test("a failed Gate sends findings to a fixer, then every Gate runs again", () => {
  let b = run(approved(base()), { kind: "testsWritten" }, { kind: "implemented" });
  b = run(b, { kind: "checked", pass: false, output: "1 test failed" });
  expect(b.step.kind).toBe("implement");
  expect((b.step as { message: string }).message).toContain("1 test failed");
  expect(b.checkpoints[0]!.gates.behavior).toBe("fail");
  b = run(b, { kind: "implemented" }, pass);
  // One reviewer approves but still lists a finding: that is a failure.
  b = run(b, { kind: "reviewed", verdicts: [{ approve: true, findings: [{ severity: "minor", text: "dead code" }] }, { approve: true, findings: [] }] });
  expect(b.step.kind).toBe("implement");
  expect((b.step as { message: string }).message).toContain("dead code");
  expect(b.checkpoints[0]!.gates).toEqual({ behavior: "waiting", ui: "waiting", review: "fail" });
  b = run(b, { kind: "implemented" });
  expect(b.step.kind).toBe("check");
});

test("a failed UI Gate reworks the Checkpoint", () => {
  let b = run(approved(base()), { kind: "testsWritten" }, { kind: "implemented" }, pass, ok, { kind: "committed", sha: "a" });
  b = run(b, { kind: "testsWritten" }, { kind: "implemented" }, pass);
  b = run(b, { kind: "reviewed", verdicts: [{ approve: false, findings: [{ severity: "major", text: "padding is 8 not 16" }] }, { approve: true, findings: [] }] });
  expect(b.checkpoints[1]!.gates.ui).toBe("fail");
  expect((b.step as { message: string }).message).toContain("padding is 8 not 16");
});

test("feedback at the end becomes new Checkpoints that run without another plan approval", () => {
  let b = approved(base({ checkCommand: "" }));
  for (let i = 0; i < 2; i++) b = run(b, { kind: "implemented" }, pass, ...(i === 1 ? [ok] : []), ok, { kind: "committed", sha: `s${i}` });
  expect(b.step.kind).toBe("finalReview");
  b = run(b, { kind: "feedback", text: "Show totals above the table" });
  expect(b.notes).toEqual(["Show totals above the table"]);
  expect(b.step).toEqual({ kind: "plan", feedback: "Show totals above the table" });
  expect(b.status).toBe("running");
  b = run(b, { kind: "planned", checkpoints: [{ title: "Totals", description: "move", tests: "", ui: true }] });
  expect(b.checkpoints.map((c) => c.id)).toEqual(["cp1", "cp2", "cp3"]);
  expect(b.current).toBe(2);
  expect(b.checkpoints[2]!.status).toBe("active");
  expect(b.step.kind).toBe("implement");
  expect(b.status).toBe("running");
});

test("feedback mid-Build reworks the current Checkpoint; repeated failure pauses", () => {
  let b = run(approved(base()), { kind: "testsWritten" }, { kind: "implemented" }, { kind: "feedback", text: "Use SF Symbols" });
  expect(b.notes).toEqual(["Use SF Symbols"]);
  expect((b.step as { message: string }).message).toContain("LEARNINGS.md");
  for (let i = 0; i < MAX_ATTEMPTS; i++) b = run(b, { kind: "implemented" }, { kind: "checked", pass: false, output: "x" });
  expect(b.status).toBe("paused");
  expect(b.step.kind).toBe("implement");
  b = run(b, { kind: "resume" });
  expect(b.status).toBe("running");
  expect(b.checkpoints[0]!.attempts).toBe(0);
});

test("stale events are ignored and stop is final", () => {
  const b = run(base(), { kind: "implemented" }, { kind: "approved" }, { kind: "testsWritten" });
  expect(b.step.kind).toBe("plan");
  const stopped = run(b, { kind: "stop" }, { kind: "resume" }, { kind: "planned", checkpoints: plan });
  expect(stopped.status).toBe("stopped");
  expect(stopped.checkpoints).toEqual([]);
});

test("parsePlan and parseVerdict read the last json fence", () => {
  expect(parsePlan('Plan:\n```json\n[{"title":"A","description":"x","tests":"t","ui":true,"prototype":"p.html"},{"title":""}]\n```')).toEqual([
    { title: "A", description: "x", tests: "t", ui: true, prototype: "p.html" },
  ]);
  expect(parsePlan('[{"title":"B"}]')).toEqual([{ title: "B", description: "", tests: "", ui: false, prototype: undefined }]);
  expect(parsePlan("no json here")).toBeNull();
  expect(parseVerdict('```json\n{"approve":false}\n```\nthen\n```json\n{"approve":true,"findings":[{"text":"t"}]}\n```')).toEqual({
    approve: true,
    findings: [{ severity: "major", file: undefined, text: "t" }],
  });
  expect(parseVerdict('{"findings":[]}')).toBeNull();
});
