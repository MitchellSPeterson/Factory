// Build: the Helix Loop (https://shopify.engineering/helix) run over one Roadmap Item. See CONTEXT.md.
// advance() is the whole state machine. The Worker performs each Step's side effect and feeds back an Event.
// You stop the loop twice: to approve the plan, and to try the finished Build.
import type { Id } from "./dataModel";
import type { AgentEffort, SessionProvider } from "./validators";
import { roadmapPrompt, type RoadmapItemFields } from "./roadmap";

export type AgentPick = { provider: SessionProvider; model: string; effort: AgentEffort };

export type GateKey = "behavior" | "ui" | "review";
export const GATES: GateKey[] = ["behavior", "ui", "review"];
export type GateState = "waiting" | "running" | "pass" | "fail" | "skipped";

// What the planner hands back for one Checkpoint, and what you edit before approving.
export type PlannedCheckpoint = {
  title: string;
  description: string;
  tests: string; // the test plan; the test writer turns it into failing tests
  ui: boolean; // changes what you see, so the UI Gate runs
  prototype?: string; // repo-relative HTML prototype the UI Gate compares against
};

export type Checkpoint = PlannedCheckpoint & {
  id: string;
  status: "pending" | "active" | "done";
  attempts: number; // implement runs for this Checkpoint, including fixes
  gates: Record<GateKey, GateState>;
  sessionId?: Id<"sessions">; // the latest implementer or fixer
  findings?: string; // last gate failure, shown on the page
  commit?: string;
};

export type Step =
  | { kind: "plan"; feedback?: string } // feedback: replan after you tried the finished Build
  | { kind: "approvePlan" }
  | { kind: "writeTests" }
  | { kind: "implement"; message: string } // message: the findings a fresh fixer Session must fix; empty on the first run
  | { kind: "check" }
  | { kind: "uiReview" }
  | { kind: "review" }
  | { kind: "commit" }
  | { kind: "finalReview" }
  | { kind: "done" };

// running: the Worker owns the next move. waiting: you do. paused: something broke; resume retries the Step.
export type BuildStatus = "running" | "waiting" | "paused" | "done" | "stopped";

export type BuildFields = {
  projectId: Id<"projects">;
  roadmapItemId: Id<"roadmapItems">;
  title: string;
  branch: string;
  worktree?: string; // set by the Worker once created
  checkCommand: string; // empty skips the test writer and the Behavior Gate
  agent: AgentPick;
  reviewers: [AgentPick, AgentPick]; // Review Gate: both adversarial. UI Gate: [0] visual, [1] behavior.
  notes: string[]; // your feedback, carried into every later prompt (agents also record it in LEARNINGS.md)
  checkpoints: Checkpoint[];
  current: number;
  step: Step;
  started: boolean; // the Worker has kicked off this Step
  sessionIds: Id<"sessions">[]; // Sessions the current Step waits on
  status: BuildStatus;
  error?: string;
};

export type Finding = { severity: string; file?: string; text: string };
export type Verdict = { approve: boolean; findings: Finding[] };

export type BuildEvent =
  | { kind: "planned"; checkpoints: PlannedCheckpoint[] }
  | { kind: "planApproved"; checkpoints: PlannedCheckpoint[] }
  | { kind: "testsWritten" }
  | { kind: "implemented" }
  | { kind: "checked"; pass: boolean; output: string }
  | { kind: "reviewed"; verdicts: Verdict[] } // answers uiReview or review, whichever is the Step
  | { kind: "approved" }
  | { kind: "feedback"; text: string }
  | { kind: "committed"; sha: string }
  | { kind: "failed"; error: string }
  | { kind: "resume" }
  | { kind: "stop" };

// ponytail: Helix retries forever; we pause after this many so an overnight run can't burn a quota on one Checkpoint.
export const MAX_ATTEMPTS = 5;

const idleGates = (): Record<GateKey, GateState> => ({ behavior: "waiting", ui: "waiting", review: "waiting" });

export function newCheckpoints(list: PlannedCheckpoint[], first = 0): Checkpoint[] {
  return list.map((c, i) => ({
    id: `cp${first + i + 1}`,
    title: c.title.trim(),
    description: c.description.trim(),
    tests: c.tests.trim(),
    ui: c.ui,
    prototype: c.prototype?.trim() || undefined,
    status: "pending",
    attempts: 0,
    gates: idleGates(),
  }));
}

function go(build: BuildFields, step: Step, status: BuildStatus = "running"): BuildFields {
  return { ...build, step, status, started: false, sessionIds: [], error: undefined };
}

function withCurrent(build: BuildFields, change: (cp: Checkpoint) => Checkpoint): BuildFields {
  return { ...build, checkpoints: build.checkpoints.map((cp, i) => (i === build.current ? change(cp) : cp)) };
}

function setGate(build: BuildFields, gate: GateKey, state: GateState) {
  return withCurrent(build, (c) => ({ ...c, gates: { ...c.gates, [gate]: state } }));
}

// A fresh fixer Session gets the findings, or the Build pauses if this Checkpoint keeps failing.
function rework(build: BuildFields, source: GateKey | "human", findings: string): BuildFields {
  const cp = build.checkpoints[build.current]!;
  const next = withCurrent(build, (c) => ({ ...c, findings, gates: source === "human" ? idleGates() : { ...idleGates(), [source]: "fail" } }));
  const fix = go(next, { kind: "implement", message: fixPrompt(source, findings) });
  if (cp.attempts >= MAX_ATTEMPTS) return { ...fix, status: "paused", error: `Failed ${cp.attempts} times. Send feedback or resume.` };
  return fix;
}

function startCheckpoint(build: BuildFields, index: number): BuildFields {
  if (index >= build.checkpoints.length) return go({ ...build, current: index }, { kind: "finalReview" }, "waiting");
  const next = withCurrent({ ...build, current: index }, (c) => ({ ...c, status: "active" }));
  const cp = next.checkpoints[index]!;
  if (build.checkCommand.trim() && cp.tests) return go(next, { kind: "writeTests" });
  return go(next, { kind: "implement", message: "" });
}

// After the Behavior Gate: the UI Gate if this Checkpoint changes what you see, then the Review Gate.
function afterBehavior(build: BuildFields): BuildFields {
  const cp = build.checkpoints[build.current]!;
  if (cp.ui) return go(setGate(build, "ui", "running"), { kind: "uiReview" });
  return go(setGate(setGate(build, "ui", "skipped"), "review", "running"), { kind: "review" });
}

export function advance(build: BuildFields, event: BuildEvent): BuildFields {
  if (event.kind === "stop") return { ...build, status: "stopped", started: false, sessionIds: [] };
  if (build.status === "stopped" || build.status === "done") return build;
  if (event.kind === "failed") return { ...build, status: "paused", error: event.error, started: false, sessionIds: [] };
  if (event.kind === "resume") {
    if (build.status !== "paused") return build;
    const fresh = build.current < build.checkpoints.length ? withCurrent(build, (c) => ({ ...c, attempts: 0 })) : build;
    const waits = build.step.kind === "approvePlan" || build.step.kind === "finalReview";
    return { ...fresh, status: waits ? "waiting" : "running", started: false, sessionIds: [], error: undefined };
  }
  if (event.kind === "feedback") {
    const text = event.text.trim();
    if (!text || build.checkpoints.length === 0 || build.step.kind === "approvePlan") return build;
    const noted = { ...build, notes: [...build.notes, text] };
    // At the end, feedback becomes new Checkpoints that go through every Gate.
    if (build.step.kind === "finalReview") return go(noted, { kind: "plan", feedback: text });
    return rework(withCurrent(noted, (c) => ({ ...c, attempts: 0 })), "human", text);
  }

  const step = build.step;
  switch (event.kind) {
    case "planned": {
      if (step.kind !== "plan") return build;
      if (event.checkpoints.length === 0) return { ...build, status: "paused", error: "The planner returned no Checkpoints." };
      if (!step.feedback) return go({ ...build, checkpoints: newCheckpoints(event.checkpoints) }, { kind: "approvePlan" }, "waiting");
      // You already said what you want, so feedback Checkpoints start without another plan approval.
      const first = build.checkpoints.length;
      return startCheckpoint({ ...build, checkpoints: [...build.checkpoints, ...newCheckpoints(event.checkpoints, first)] }, first);
    }
    case "planApproved":
      if (step.kind !== "approvePlan" || event.checkpoints.length === 0) return build;
      return startCheckpoint({ ...build, checkpoints: newCheckpoints(event.checkpoints) }, 0);
    case "testsWritten":
      if (step.kind !== "writeTests") return build;
      return go(build, { kind: "implement", message: "" });
    case "implemented":
      if (step.kind !== "implement") return build;
      return go(
        withCurrent(build, (c) => ({ ...c, attempts: c.attempts + 1, gates: { ...idleGates(), behavior: "running" } })),
        { kind: "check" },
      );
    case "checked":
      if (step.kind !== "check") return build;
      if (!event.pass) return rework(build, "behavior", event.output);
      return afterBehavior(setGate(build, "behavior", build.checkCommand.trim() ? "pass" : "skipped"));
    case "reviewed": {
      if (step.kind !== "uiReview" && step.kind !== "review") return build;
      const gate: GateKey = step.kind === "uiReview" ? "ui" : "review";
      const findings = event.verdicts.flatMap((v) => v.findings);
      // Every finding has to be fixed, even when a reviewer says approve.
      if (event.verdicts.some((v) => !v.approve) || findings.length > 0) return rework(build, gate, formatFindings(findings));
      const passed = withCurrent(setGate(build, gate, "pass"), (c) => ({ ...c, findings: undefined }));
      if (gate === "ui") return go(setGate(passed, "review", "running"), { kind: "review" });
      return go(passed, { kind: "commit" });
    }
    case "committed":
      if (step.kind !== "commit") return build;
      return startCheckpoint(withCurrent(build, (c) => ({ ...c, status: "done", commit: event.sha })), build.current + 1);
    case "approved":
      if (step.kind !== "finalReview") return build;
      return go(build, { kind: "done" }, "done");
  }
  return build;
}

// ---- Prompts. Each asks for one fenced ```json block that parseJson reads back.

type ItemForPrompt = Parameters<typeof roadmapPrompt>[0];

const LEARNINGS = "Read LEARNINGS.md at the repository root first if it exists, and follow it.";

function notesBlock(notes: string[]) {
  return notes.length ? ["Feedback from the engineer on this Build. Follow it:", ...notes.map((n) => `- ${n}`)].join("\n") : "";
}

export function planPrompt(item: ItemForPrompt, build: Pick<BuildFields, "branch" | "checkpoints" | "notes">, feedback?: string) {
  const dir = `prototypes/${build.branch.replace(/^build\//, "")}`;
  const intro = feedback
    ? [
        "You are replanning a Build. Every Checkpoint below is already committed, and the engineer tried the result. Plan only the new Checkpoints their feedback needs.",
        ["Already committed:", ...build.checkpoints.map((c) => `- ${c.title}`)].join("\n"),
        `The engineer's feedback:\n${feedback}`,
        "Also add the general lesson behind this feedback to LEARNINGS.md at the repository root (create it if missing): one short bullet future agents can follow.",
      ]
    : [
        "You are planning a Build. Read this repository, then split the work below into Checkpoints: small, ordered slices, each one reviewable in a few minutes and ending in a working, committable state. Start with the simplest foundations so bugs surface early; later Checkpoints add behavior.",
      ];
  return [
    ...intro,
    LEARNINGS,
    "For each Checkpoint, write a test plan: the tests that prove it works from the user's point of view, bottom-up (pure logic, then API, then permissions). Tests must not need a browser.",
    `For each Checkpoint that changes what the user sees, write a single-file clickable HTML prototype of the finished screen at ${dir}/<n>.html (n is the Checkpoint's number), following DESIGN.md if the repository has one.`,
    `Do not change any files except ${dir}/${feedback ? " and LEARNINGS.md" : ""}.`,
    roadmapPrompt(item),
    notesBlock(build.notes),
    `Reply with one \`\`\`json block: [{"title": "...", "description": "one or two sentences", "tests": "the test plan", "ui": true|false, "prototype": "${dir}/1.html or omit"}]`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function checkpointContext(build: Pick<BuildFields, "checkpoints" | "current">, role: string) {
  const cp = build.checkpoints[build.current]!;
  const done = build.checkpoints.slice(0, build.current).map((c) => `- ${c.title}`);
  return [
    `You are the ${role} for Checkpoint ${build.current + 1} of ${build.checkpoints.length}: ${cp.title}`,
    cp.description,
    done.length ? ["Already committed:", ...done].join("\n") : "",
    LEARNINGS,
  ];
}

export function testsPrompt(item: ItemForPrompt, build: Pick<BuildFields, "checkpoints" | "current" | "notes">) {
  const cp = build.checkpoints[build.current]!;
  return [
    ...checkpointContext(build, "test writer"),
    `Write the tests for this Checkpoint from this test plan:\n${cp.tests}`,
    "Write only tests, no implementation. They should fail now and pass once the Checkpoint is built. Follow the repository's existing test style. Do not commit.",
    notesBlock(build.notes),
    ["The whole Roadmap Item, for context:", roadmapPrompt(item)].join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

// message: fixPrompt findings for a fresh fixer Session; empty for the first implementer.
export function implementPrompt(item: ItemForPrompt, build: Pick<BuildFields, "checkpoints" | "current" | "notes" | "checkCommand">, message = "") {
  const cp = build.checkpoints[build.current]!;
  const tested = build.checkCommand.trim() && cp.tests;
  return [
    ...checkpointContext(build, message ? "fixer" : "implementer"),
    message,
    message
      ? ""
      : tested
        ? "Tests for this Checkpoint are already written and uncommitted in this worktree. Make them pass without weakening them."
        : "Add or update tests that describe this Checkpoint from the user's point of view.",
    cp.prototype ? `Match the prototype at ${cp.prototype}.` : "",
    "Build only this Checkpoint. Do not commit; Factory commits once every Gate passes.",
    notesBlock(build.notes),
    ["The whole Roadmap Item, for context:", roadmapPrompt(item)].join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function fixPrompt(source: GateKey | "human", findings: string) {
  const from = {
    behavior: "The check command failed",
    ui: "UI reviewers found differences from the prototype",
    review: "Reviewers found problems",
    human: "The engineer gave feedback",
  }[source];
  const learn = source === "human" ? " Also add the general lesson behind it to LEARNINGS.md at the repository root (create it if missing): one short bullet future agents can follow." : "";
  return `A previous attempt at this Checkpoint is uncommitted in this worktree. ${from}. Fix the root cause of all of it, then stop.${learn}\n\n${findings}`;
}

const VERDICT = 'Reply with one ```json block: {"approve": true|false, "findings": [{"severity": "blocker|major|minor", "file": "path:line", "text": "..."}]}';

export function reviewPrompt(cp: Pick<Checkpoint, "title" | "description">, guides: string) {
  return [
    `You are an adversarial code reviewer. Assume these changes are wrong until you have checked them. Review only the uncommitted changes in this worktree (git status, git diff HEAD, and any untracked files). They should implement: ${cp.title}. ${cp.description}`,
    "Do not change any files. Check against the repository's own docs and conventions" + (guides ? ` (${guides})` : "") + ". Report every real problem: bugs, missing tests, broken conventions, dead code. Leave out taste.",
    VERDICT,
  ].join("\n\n");
}

export function uiReviewPrompt(cp: Pick<Checkpoint, "title" | "description" | "prototype">, role: "visual" | "behavior") {
  const target = cp.prototype ? `the prototype at ${cp.prototype} (open it in a browser too)` : "the Checkpoint's description";
  const focus =
    role === "visual"
      ? "Compare layout, spacing, alignment, typography, color, and icons, in light and dark mode."
      : "Compare behavior: every interaction, input, button, navigation, and the loading, empty, and error states.";
  return [
    `You are a UI ${role} reviewer. The uncommitted changes in this worktree implement: ${cp.title}. ${cp.description}`,
    `Run the app from this worktree, open the screens this Checkpoint changed, and take screenshots (a simulator, e.g. xcrun simctl io booted screenshot, or a browser). Compare what you see with ${target}, and with DESIGN.md if the repository has one. ${focus}`,
    "Do not change any source files. Report every difference that matters to a user, with where you saw it. If you cannot run the app, say so as a blocker finding.",
    VERDICT,
  ].join("\n\n");
}

export function formatFindings(findings: Finding[]) {
  return findings.map((f) => `- [${f.severity}]${f.file ? ` ${f.file}:` : ""} ${f.text}`).join("\n");
}

// Last ```json fence in the text, else the whole text. null if it isn't JSON.
export function parseJson(text: string): unknown {
  const fences = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
  const body = fences.length ? fences[fences.length - 1]![1]! : text;
  try {
    return JSON.parse(body.trim());
  } catch {
    return null;
  }
}

export function parsePlan(text: string): PlannedCheckpoint[] | null {
  const value = parseJson(text);
  if (!Array.isArray(value)) return null;
  const list = value
    .filter((v) => v && typeof v.title === "string" && v.title.trim())
    .map((v) => ({
      title: String(v.title),
      description: String(v.description ?? ""),
      tests: String(v.tests ?? ""),
      ui: v.ui === true,
      prototype: typeof v.prototype === "string" && v.prototype.trim() ? v.prototype.trim() : undefined,
    }));
  return list.length ? list : null;
}

export function parseVerdict(text: string): Verdict | null {
  const value = parseJson(text) as { approve?: unknown; findings?: unknown } | null;
  if (!value || typeof value.approve !== "boolean") return null;
  const findings = Array.isArray(value.findings)
    ? value.findings
        .filter((f) => f && typeof f.text === "string")
        .map((f) => ({ severity: String(f.severity ?? "major"), file: f.file ? String(f.file) : undefined, text: String(f.text) }))
    : [];
  return { approve: value.approve, findings };
}

export function branchFor(title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "build";
  return `build/${slug}`;
}
