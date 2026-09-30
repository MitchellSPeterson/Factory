import type { AgentPick, BuildStatus, PlannedCheckpoint } from './helix';
import type { Requirement } from './roadmap';

export const WORKFLOW_ROLES = ['prototype', 'planner', 'builder', 'verifier', 'reviewer'] as const;
export type WorkflowRole = typeof WORKFLOW_ROLES[number];
export type WorkflowPhase = 'setup' | 'refine' | 'prototype' | 'prototypeReview' | 'plan' | 'build' | 'verify' | 'review' | 'publish' | 'prReview' | 'done';
export type PrototypeMode = 'auto' | 'required' | 'skip';
export type RoleConfiguration = AgentPick & { skills: string[] };
export type BuildConfiguration = {
  roles: Record<WorkflowRole, RoleConfiguration>;
  setupCommand: string;
  checkCommands: string[];
  previewCommand: string;
  verificationTargets: string[];
  roleTimeoutMs: Record<WorkflowRole, number>;
  runtimeCeilingMs: number;
  tokenCeiling?: number;
  costCeilingCents?: number;
  discovered?: boolean;
};
export type BuildConfigurationOverride = Partial<Omit<BuildConfiguration, 'roles' | 'roleTimeoutMs'>> & {
  roles?: Partial<Record<WorkflowRole, Partial<RoleConfiguration>>>;
  roleTimeoutMs?: Partial<Record<WorkflowRole, number>>;
};
export type SkillSnapshot = { slug: string; body: string; version: string; path?: string; role: WorkflowRole };
export type WorkflowArtifact = { id: string; kind: 'prototype' | 'screenshot' | 'log' | 'visualExplanation' | 'report'; path: string; mime: string; title: string; revision: string; batch: number; requirementId?: string; prototypeRevision?: string };
export type PrototypeRevision = { id: string; artifactId: string; createdAt: number; instruction?: string };
export type PrototypeComment = { id: string; revision: string; text: string; resolved: boolean; pin?: { x: number; y: number; viewportWidth?: number; viewportHeight?: number; selector?: string }; createdAt: number };
export type WorkflowFinding = { id: string; severity: 'blocking' | 'suggestion'; text: string; evidence: string; impact: string; file?: string; line?: number; resolved?: boolean };
export type ExecutedCheck = { command: string; exitCode: number; output: string; executedAt: number };
export type RequirementEvidence = { requirementId: string; pass: boolean; evidence: string; artifactIds?: string[] };
export type WorkflowReport = { role: 'verifier' | 'reviewer'; revision: string; pass: boolean; findings: WorkflowFinding[]; checks: ExecutedCheck[]; requirements: RequirementEvidence[]; screenshotIds: string[]; environmentBlocker?: string; productChanged?: boolean; sessionId?: string };
export type WorkflowFeedback = { id: string; text: string; source: 'factory' | 'github'; authorized: boolean; changesDesign: boolean; createdAt: number; reviewId?: string };
export type WorkflowPr = { url: string; number: number; repo: string; head: string; state: 'open' | 'closed' | 'merged'; authorizedLogins?: string[] };
export type WorkflowStage = { id: string; generation: number; phase: WorkflowPhase; role: WorkflowRole; sessionId: string; startedAt: number };
export type WorkflowState = {
  version: 2;
  phase: WorkflowPhase;
  generation: number;
  status: BuildStatus;
  config: BuildConfiguration;
  prototypeMode: PrototypeMode;
  needsPrototype: boolean;
  ui: boolean;
  skillSnapshots: SkillSnapshot[];
  configurationIssues: string[];
  batch: { number: number; attempts: number };
  requirements: Requirement[];
  plan: PlannedCheckpoint[];
  candidateRevision?: string;
  attemptActive?: boolean;
  candidates: Array<{ batch: number; attempt: number; revision: string; reports: WorkflowReport[] }>;
  prototypeRevisions: PrototypeRevision[];
  approvedPrototypeRevision?: string;
  comments: PrototypeComment[];
  artifacts: WorkflowArtifact[];
  reports: { verifier?: WorkflowReport; reviewer?: WorkflowReport };
  findings: WorkflowFinding[];
  pendingFeedback: WorkflowFeedback[];
  feedbackHistory: WorkflowFeedback[];
  notes: string[];
  actionIds: string[];
  stages: Partial<Record<WorkflowRole, WorkflowStage>>;
  sessionIds: string[];
  runtimeMs: number;
  tokens: number;
  costCents: number;
  error?: string;
  blocker?: 'environment' | 'budget' | 'resource' | 'interrupted' | 'decision' | 'externalHead';
  prototypeInstruction?: string;
  pr?: WorkflowPr;
};
export type WorkflowSource = { id: string; generation: number; phase: WorkflowPhase };
export type WorkflowAction = WorkflowSource & (
  | { kind: 'skills'; snapshots: SkillSnapshot[] }
  | { kind: 'setup'; config: BuildConfiguration }
  | { kind: 'refined'; requirements: Requirement[]; needsPrototype: boolean; ui: boolean; decision?: string }
  | { kind: 'prototyped'; revision: PrototypeRevision; artifact: WorkflowArtifact }
  | { kind: 'planned'; checkpoints: PlannedCheckpoint[] }
  | { kind: 'candidate'; revision: string }
  | { kind: 'report'; report: WorkflowReport }
  | { kind: 'published'; pr: WorkflowPr; artifacts?: WorkflowArtifact[] }
  | { kind: 'prSync'; pr: WorkflowPr; feedback?: WorkflowFeedback[] }
  | { kind: 'failed'; error: string; blocker?: WorkflowState['blocker']; retryBuilder?: boolean }
  | { kind: 'resources'; runtimeMs: number; tokens?: number; costCents?: number }
  | { kind: 'artifact'; artifact: WorkflowArtifact }
  | { kind: 'comment'; comment: PrototypeComment }
  | { kind: 'resolveComment'; commentId: string; resolved: boolean }
  | { kind: 'requestRevision'; revision: string; text: string }
  | { kind: 'approvePrototype'; revision: string }
  | { kind: 'feedback'; feedback: WorkflowFeedback }
  | { kind: 'requestChanges'; text: string; changesDesign: boolean; feedbackId?: string }
  | { kind: 'pause' | 'stop' | 'resume' | 'continue' }
  | { kind: 'answerDecision'; text: string }
  | { kind: 'raiseCeiling'; runtimeCeilingMs?: number; tokenCeiling?: number; costCeilingCents?: number }
);
export type WorkflowStageClaim = { buildId: string; accessKey: string; generation: number; phase: WorkflowPhase; role: WorkflowRole; text: string; cwd: string; title?: string; readOnlyRoots?: string[]; evidenceDirectory?: string };

export function resolveBuildConfiguration(agent: AgentPick, reviewer: AgentPick, base?: BuildConfiguration, override: BuildConfigurationOverride = {}, checkCommand = ''): BuildConfiguration {
  const roles = Object.fromEntries(WORKFLOW_ROLES.map(role => [role, { ...(base?.roles[role] ?? { ...(role === 'verifier' || role === 'reviewer' ? reviewer : agent), skills: [] }), ...override.roles?.[role] }])) as BuildConfiguration['roles'];
  const roleTimeoutMs = Object.fromEntries(WORKFLOW_ROLES.map(role => [role, override.roleTimeoutMs?.[role] ?? base?.roleTimeoutMs[role] ?? 1_200_000])) as BuildConfiguration['roleTimeoutMs'];
  const config = { setupCommand: '', checkCommands: checkCommand.trim() ? [checkCommand.trim()] : [], previewCommand: '', verificationTargets: [], runtimeCeilingMs: 14_400_000, ...base, ...override, roles, roleTimeoutMs };
  validateBuildConfiguration(config);
  return structuredClone(config);
}
export function validateBuildConfiguration(config: BuildConfiguration): void {
  if (!config || !Array.isArray(config.checkCommands) || !Array.isArray(config.verificationTargets) || typeof config.setupCommand !== 'string' || typeof config.previewCommand !== 'string') throw new Error('Invalid Build configuration.');
  if (config.checkCommands.some(command => typeof command !== 'string' || !command.trim()) || config.verificationTargets.some(target => typeof target !== 'string' || !target.trim())) throw new Error('Invalid Build commands or targets.');
  for (const role of WORKFLOW_ROLES) {
    const pick = config.roles?.[role];
    if (!pick || !['codex', 'cursor', 'grok', 'claude', 'openai'].includes(pick.provider) || !pick.model?.trim() || !['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(pick.effort) || !Array.isArray(pick.skills) || pick.skills.some(skill => typeof skill !== 'string' || !skill.trim()) || !Number.isFinite(config.roleTimeoutMs?.[role]) || config.roleTimeoutMs[role] <= 0) throw new Error(`Invalid ${role} settings.`);
  }
  for (const value of [config.runtimeCeilingMs, config.tokenCeiling, config.costCeilingCents]) if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new Error('Build ceilings must be positive.');
}
export function createWorkflow(config: BuildConfiguration, prototypeMode: PrototypeMode = 'auto', requirements: Requirement[] = []): WorkflowState {
  return { version: 2, phase: config.discovered ? 'refine' : 'setup', generation: 0, status: 'running', config: structuredClone(config), prototypeMode, needsPrototype: prototypeMode === 'required', ui: false, skillSnapshots: [], configurationIssues: [], batch: { number: 1, attempts: 0 }, requirements: structuredClone(requirements), plan: [], candidates: [], prototypeRevisions: [], comments: [], artifacts: [], reports: {}, findings: [], pendingFeedback: [], feedbackHistory: [], notes: [], actionIds: [], stages: {}, sessionIds: [], runtimeMs: 0, tokens: 0, costCents: 0 };
}

export const HUMAN_WORKFLOW_ACTIONS = new Set<WorkflowAction['kind']>(['comment', 'resolveComment', 'requestRevision', 'approvePrototype', 'feedback', 'requestChanges', 'pause', 'stop', 'resume', 'continue', 'raiseCeiling', 'answerDecision']);
const ACTIVE_PHASES = new Set<WorkflowPhase>(['setup', 'refine', 'prototype', 'plan', 'build', 'verify', 'review', 'publish']);
export function resourceBlocker(state: WorkflowState): string | undefined {
  if (state.runtimeMs >= state.config.runtimeCeilingMs) return 'Build runtime ceiling reached.';
  if (state.config.tokenCeiling !== undefined && state.tokens >= state.config.tokenCeiling) return 'Build token ceiling reached.';
  if (state.config.costCeilingCents !== undefined && state.costCents >= state.config.costCeilingCents) return 'Build spending ceiling reached.';
}
function transition(state: WorkflowState, phase: WorkflowPhase, status: BuildStatus = 'running'): void {
  state.phase = phase; state.status = status; state.generation += 1; state.stages = {}; delete state.error; delete state.blocker;
}
function pause(state: WorkflowState, error: string, blocker: WorkflowState['blocker']): void {
  state.status = 'paused'; state.error = error; state.blocker = blocker;
}
function requirePhase(state: WorkflowState, ...phases: WorkflowPhase[]): void {
  if (!phases.includes(state.phase)) throw new Error(`Action is not valid in ${state.phase}.`);
}
function currentPrototype(state: WorkflowState, revision: string): void {
  if (state.prototypeRevisions.at(-1)?.id !== revision) throw new Error('Prototype revision is stale.');
}
function beginChanges(state: WorkflowState, text: string, changesDesign: boolean): void {
  state.batch = { number: state.batch.number + 1, attempts: 0 };
  state.attemptActive = false;
  state.notes.push(text);
  state.reports = {}; state.findings = []; delete state.candidateRevision;
  if (changesDesign) { delete state.approvedPrototypeRevision; state.needsPrototype = true; state.prototypeInstruction = text; }
  transition(state, changesDesign ? 'prototype' : 'plan');
}
function evaluateReports(state: WorkflowState): void {
  const verifier = state.reports.verifier, reviewer = state.reports.reviewer;
  if (!verifier || !reviewer) return;
  const candidate = [...state.candidates].reverse().find(candidate => candidate.revision === state.candidateRevision && candidate.batch === state.batch.number);
  if (candidate) candidate.reports = [verifier, reviewer];
  state.findings = [...verifier.findings, ...reviewer.findings];
  const environment = verifier.environmentBlocker || reviewer.environmentBlocker;
  if (environment) { pause(state, environment, 'environment'); return; }
  if (verifier.productChanged || reviewer.productChanged) { pause(state, 'Candidate changed during evaluation. Evidence is invalid.', 'environment'); state.reports = {}; return; }
  const required = state.requirements.every(requirement => verifier.requirements.some(evidence => evidence.requirementId === requirement.id && evidence.pass && evidence.evidence.trim()));
  const checked = state.config.checkCommands.every(command => verifier.checks.some(check => check.command === command && check.exitCode === 0 && Number.isFinite(check.executedAt)));
  const screenshots = !state.ui || verifier.screenshotIds.some(id => state.artifacts.some(artifact => artifact.id === id && artifact.kind === 'screenshot' && artifact.revision === state.candidateRevision));
  const pass = verifier.pass && (reviewer.pass || reviewer.findings.every(finding => finding.severity === 'suggestion')) && required && checked && screenshots && !state.findings.some(finding => finding.severity === 'blocking' && !finding.resolved);
  const missingEvidence = state.requirements.some(requirement => !verifier.requirements.some(evidence => evidence.requirementId === requirement.id && evidence.evidence.trim())) || state.config.checkCommands.some(command => !verifier.checks.some(check => check.command === command)) || !screenshots;
  if (missingEvidence) { pause(state, 'Required execution, Requirement, or screenshot evidence is missing.', 'environment'); return; }
  if (pass) {
    const feedback = state.pendingFeedback.find(feedback => feedback.authorized && (feedback.source === 'factory' || feedback.reviewId));
    if (feedback) { state.pendingFeedback = state.pendingFeedback.filter(row => row.id !== feedback.id); beginChanges(state, feedback.text, feedback.changesDesign); }
    else transition(state, 'publish');
  }
  else if (state.batch.attempts < 3) { state.attemptActive = false; transition(state, 'build'); }
  else pause(state, 'Three Candidate attempts did not pass. Continue authorizes a new Batch.', 'budget');
}
export function advanceWorkflow(input: WorkflowState, action: WorkflowAction): WorkflowState {
  if (!action || typeof action.id !== 'string' || !action.id.trim()) throw new Error('Action identity is required.');
  if (input.actionIds.includes(action.id)) return input;
  if (action.generation !== input.generation || action.phase !== input.phase) throw new Error('Workflow action is stale.');
  const state = structuredClone(input);
  if (state.status === 'done' || state.status === 'stopped') {
    if (!['comment', 'feedback', 'prSync'].includes(action.kind)) throw new Error('This Build has ended.');
  }
  switch (action.kind) {
    case 'skills':
      requirePhase(state, 'setup', 'refine');
      if (state.skillSnapshots.length) throw new Error('Skill snapshots are immutable.');
      state.skillSnapshots = structuredClone(action.snapshots); break;
    case 'setup':
      requirePhase(state, 'setup'); validateBuildConfiguration(action.config);
      if (JSON.stringify(action.config.roles) !== JSON.stringify(state.config.roles)) throw new Error('Discovery cannot change role settings captured at Build creation.');
      state.config = structuredClone(action.config); state.config.discovered = true; transition(state, 'refine'); break;
    case 'refined':
      requirePhase(state, 'refine');
      if (!Array.isArray(action.requirements) || !action.requirements.length || action.requirements.some(requirement => !requirement.id?.trim() || !requirement.text?.trim() || typeof requirement.done !== 'boolean') || new Set(action.requirements.map(requirement => requirement.id)).size !== action.requirements.length) throw new Error('Refined Requirements are required with unique identities.');
      state.requirements = structuredClone(action.requirements); state.ui = action.ui;
      state.needsPrototype = state.prototypeMode === 'required' || (state.prototypeMode === 'auto' && action.needsPrototype);
      if (action.decision) pause(state, action.decision, 'decision'); else transition(state, state.needsPrototype ? 'prototype' : 'plan'); break;
    case 'prototyped':
      requirePhase(state, 'prototype');
      if (state.prototypeRevisions.some(revision => revision.id === action.revision.id) || action.artifact.kind !== 'prototype' || action.artifact.id !== action.revision.artifactId || action.artifact.revision !== action.revision.id) throw new Error('Invalid Prototype revision.');
      state.prototypeRevisions.push(action.revision); state.artifacts.push(action.artifact); transition(state, 'prototypeReview', 'waiting'); break;
    case 'planned':
      requirePhase(state, 'plan'); if (!action.checkpoints.length) throw new Error('The plan needs at least one Checkpoint.');
      if (state.needsPrototype && !state.approvedPrototypeRevision) throw new Error('Approve the Prototype first.');
      state.plan = structuredClone(action.checkpoints); state.attemptActive = false; transition(state, 'build'); break;
    case 'candidate':
      requirePhase(state, 'build');
      if (!state.attemptActive || !/^[a-f0-9]{40,64}$/.test(action.revision)) throw new Error('A Candidate requires a reserved builder attempt and revision.');
      state.candidateRevision = action.revision; state.attemptActive = false; state.reports = {};
      state.candidates.push({ batch: state.batch.number, attempt: state.batch.attempts, revision: action.revision, reports: [] }); transition(state, 'verify'); break;
    case 'report': {
      requirePhase(state, 'verify', 'review'); const report = action.report;
      if (report.revision !== state.candidateRevision || !['verifier', 'reviewer'].includes(report.role)) throw new Error('Report revision is stale.');
      if (!Array.isArray(report.findings) || !Array.isArray(report.checks) || !Array.isArray(report.requirements) || !Array.isArray(report.screenshotIds) || typeof report.pass !== 'boolean' || report.checks.some(check => !check.command?.trim() || !Number.isInteger(check.exitCode) || !Number.isFinite(check.executedAt) || check.executedAt <= 0 || typeof check.output !== 'string') || report.findings.some(finding => !['blocking', 'suggestion'].includes(finding.severity) || !finding.text?.trim() || !finding.evidence?.trim() || !finding.impact?.trim()) || report.requirements.some(evidence => !evidence.requirementId?.trim() || typeof evidence.pass !== 'boolean' || !evidence.evidence?.trim())) throw new Error('Invalid executed report evidence.');
      if (state.reports[report.role]) throw new Error('This role already submitted its report.');
      state.reports[report.role] = structuredClone(report); evaluateReports(state); break;
    }
    case 'artifact':
      if (state.artifacts.some(artifact => artifact.id === action.artifact.id)) throw new Error('Artifact identity already exists.');
      if (action.artifact.revision !== state.candidateRevision && !state.prototypeRevisions.some(revision => revision.id === action.artifact.revision)) throw new Error('Artifact revision is stale.');
      state.artifacts.push(structuredClone(action.artifact)); break;
    case 'published':
      requirePhase(state, 'publish'); if (action.pr.head !== state.candidateRevision) throw new Error('PR head differs from the reviewed Candidate.');
      if (state.pr && state.pr.url !== action.pr.url) throw new Error('A Build keeps one PR identity.');
      state.pr = action.pr; state.artifacts.push(...(action.artifacts ?? [])); transition(state, 'prReview', 'waiting'); break;
    case 'prSync': {
      if (!state.pr || state.pr.url !== action.pr.url) throw new Error('PR identity differs.');
      const previousHead = state.pr.head;
      state.pr = action.pr;
      for (const feedback of action.feedback ?? []) {
        if (state.feedbackHistory.some(existing => existing.id === feedback.id)) continue;
        state.feedbackHistory.push(feedback); state.pendingFeedback.push(feedback);
      }
      if (action.pr.state === 'merged') transition(state, 'done', 'done');
      else if (action.pr.state === 'closed') pause(state, 'PR closed without merging.', 'environment');
      else if (action.pr.head !== previousHead) {
        state.reports = {}; state.generation += 1;
        pause(state, 'PR head changed. Request changes explicitly authorizes a new Batch; Resume cannot approve unverified code.', 'externalHead');
      }
      else if (state.phase === 'prReview' && state.status === 'waiting') {
        const feedback = state.pendingFeedback.find(feedback => feedback.authorized && (feedback.source === 'factory' || feedback.reviewId));
        if (feedback) { state.pendingFeedback = state.pendingFeedback.filter(row => row.id !== feedback.id); beginChanges(state, feedback.text, feedback.changesDesign); }
      }
      break;
    }
    case 'comment':
      if (!state.prototypeRevisions.some(revision => revision.id === action.comment.revision) || !action.comment.text.trim()) throw new Error('Comment needs a preserved Prototype revision.');
      if (state.comments.some(comment => comment.id === action.comment.id)) throw new Error('Comment identity already exists.');
      if (action.comment.pin && [action.comment.pin.x, action.comment.pin.y].some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('Pin coordinates must be normalized.');
      state.comments.push(action.comment); break;
    case 'resolveComment': {
      const comment = state.comments.find(comment => comment.id === action.commentId); if (!comment) throw new Error('Comment not found.'); comment.resolved = action.resolved; break;
    }
    case 'requestRevision':
      requirePhase(state, 'prototypeReview'); currentPrototype(state, action.revision); state.prototypeInstruction = action.text; transition(state, 'prototype'); break;
    case 'approvePrototype':
      requirePhase(state, 'prototypeReview'); currentPrototype(state, action.revision); state.approvedPrototypeRevision = action.revision; transition(state, 'plan'); break;
    case 'feedback':
      if (!state.feedbackHistory.some(feedback => feedback.id === action.feedback.id)) { state.feedbackHistory.push(action.feedback); state.pendingFeedback.push(action.feedback); } break;
    case 'requestChanges': {
      if (!action.text.trim()) throw new Error('Change instructions are required.');
      const feedback: WorkflowFeedback = { id: action.feedbackId ?? action.id, text: action.text, changesDesign: action.changesDesign, authorized: true, source: 'factory', createdAt: Date.now() };
      if (state.feedbackHistory.some(existing => existing.id === feedback.id)) break;
      state.feedbackHistory.push(feedback);
      if (state.status === 'running' && ACTIVE_PHASES.has(state.phase)) state.pendingFeedback.push(feedback);
      else { state.pendingFeedback = state.pendingFeedback.filter(row => row.id !== feedback.id); beginChanges(state, action.text, action.changesDesign); }
      break;
    }
    case 'failed':
      if (action.retryBuilder && state.phase === 'build') { state.attemptActive = false; if (state.batch.attempts < 3) transition(state, 'build'); else pause(state, action.error, 'budget'); }
      else pause(state, action.error, action.blocker ?? 'environment'); break;
    case 'resources':
      for (const value of [action.runtimeMs, action.tokens ?? 0, action.costCents ?? 0]) if (!Number.isFinite(value) || value < 0) throw new Error('Invalid resource usage.');
      state.runtimeMs += action.runtimeMs; state.tokens += action.tokens ?? 0; state.costCents += action.costCents ?? 0;
      if (resourceBlocker(state)) pause(state, resourceBlocker(state)!, 'resource'); break;
    case 'pause': if (state.status !== 'running') throw new Error('Only running work can pause.'); state.generation += 1; pause(state, 'Paused by you.', 'interrupted'); break;
    case 'stop': state.status = 'stopped'; state.generation += 1; break;
    case 'resume':
      if (state.blocker === 'externalHead') throw new Error('PR head changed. Request changes explicitly authorizes a new Batch; Resume cannot approve unverified code.');
      if (state.status !== 'paused' || ['budget', 'decision'].includes(state.blocker ?? '') || resourceBlocker(state)) throw new Error('Resume cannot renew the Batch or exhausted resource ceiling.');
      if (state.phase === 'verify' || state.phase === 'review') state.reports = {};
      transition(state, state.phase, ['prototypeReview', 'prReview'].includes(state.phase) ? 'waiting' : 'running'); break;
    case 'continue':
      if (state.status !== 'paused' || state.blocker !== 'budget') throw new Error('Continue is available after Candidate budget exhaustion.');
      if (resourceBlocker(state)) throw new Error(resourceBlocker(state));
      state.batch = { number: state.batch.number + 1, attempts: 0 }; state.attemptActive = false; state.reports = {}; transition(state, 'build'); break;
    case 'answerDecision':
      if (state.status !== 'paused' || state.blocker !== 'decision' || !action.text.trim()) throw new Error('Answer the pending scope or behavior decision.');
      state.notes.push(action.text); transition(state, 'refine'); break;
    case 'raiseCeiling': {
      let increased = false;
      for (const key of ['runtimeCeilingMs', 'tokenCeiling', 'costCeilingCents'] as const) {
        const value = action[key], previous = state.config[key];
        if (value === undefined) continue;
        if (!Number.isFinite(value) || value <= 0 || (previous !== undefined && value < previous)) throw new Error('Resource ceilings cannot decrease.');
        if (previous === undefined || value > previous) increased = true;
        state.config[key] = value;
      }
      if (!increased) throw new Error('Raise at least one resource ceiling explicitly.');
      validateBuildConfiguration(state.config); break;
    }
    default: throw new Error('Unknown Workflow action.');
  }
  state.actionIds.push(action.id);
  return state;
}
export function claimWorkflowStage(state: WorkflowState, claim: Omit<WorkflowStageClaim, 'buildId' | 'accessKey' | 'text' | 'cwd'>, sessionId: string, now = Date.now()): WorkflowState {
  if (state.generation !== claim.generation || state.phase !== claim.phase || state.status !== 'running') throw new Error('Stage claim is stale.');
  if (resourceBlocker(state)) throw new Error(resourceBlocker(state));
  if (state.configurationIssues.length) throw new Error(state.configurationIssues.join('\n'));
  const allowed: Partial<Record<WorkflowPhase, WorkflowRole[]>> = { setup: ['planner'], refine: ['planner'], prototype: ['prototype'], plan: ['planner'], build: ['builder'], verify: ['verifier', 'reviewer'], review: ['reviewer'], publish: ['prototype'] };
  if (!allowed[state.phase]?.includes(claim.role)) throw new Error('Role cannot claim this phase.');
  if (state.stages[claim.role]) return state;
  const next = structuredClone(state);
  if (claim.role === 'builder' && !next.attemptActive) {
    if (next.batch.attempts >= 3) throw new Error('Candidate budget exhausted.');
    next.batch.attempts += 1; next.attemptActive = true;
  }
  next.stages[claim.role] = { id: `${next.generation}:${claim.role}`, generation: next.generation, phase: next.phase, role: claim.role, sessionId, startedAt: now };
  next.sessionIds.push(sessionId); return next;
}
