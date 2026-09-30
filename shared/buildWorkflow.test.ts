import { expect, test } from 'bun:test';
import { advanceWorkflow, claimWorkflowStage, createWorkflow, resolveBuildConfiguration, type WorkflowAction, type WorkflowState, type WorkflowReport } from './buildWorkflow';
const agent = { provider: 'codex' as const, model: 'gpt-5', effort: 'high' as const };
const requirement = { id: 'r1', text: 'Search matches', done: false };
const revision = (number: number) => String(number).repeat(40);
let id = 0;
const act = (state: WorkflowState, action: Omit<WorkflowAction, 'id' | 'generation' | 'phase'> | object) => advanceWorkflow(state, { id: String(++id), generation: state.generation, phase: state.phase, ...action } as WorkflowAction);
function start() {
  let state = createWorkflow(resolveBuildConfiguration(agent, agent, undefined, { discovered: true, checkCommands: ['bun test'] }), 'skip');
  state = act(state, { kind: 'refined', requirements: [requirement], needsPrototype: false, ui: false });
  return act(state, { kind: 'planned', checkpoints: [{ title: 'Search', description: 'Integrated search', tests: 'Search matches', ui: false }] });
}
const claim = (state: WorkflowState, role: 'builder' | 'verifier' | 'reviewer' = 'builder') => claimWorkflowStage(state, { generation: state.generation, phase: state.phase, role }, `session${++id}`);
function report(state: WorkflowState, role: 'verifier' | 'reviewer', pass = true): WorkflowReport {
  return { role, revision: state.candidateRevision!, pass, findings: pass ? [] : [{ id: 'broken', severity: 'blocking', text: 'No matches', evidence: 'Search returns none', impact: 'Search unusable' }], checks: role === 'verifier' ? [{ command: 'bun test', exitCode: pass ? 0 : 1, output: 'Executed', executedAt: Date.now() }] : [], requirements: role === 'verifier' ? [{ requirementId: requirement.id, pass, evidence: 'Executed search' }] : [], screenshotIds: [] };
}
test('exactly three builder starts across complete and incomplete attempts; explicit renewal preserves ceiling', () => {
  let state = start();
  for (let number = 1; number <= 3; number++) {
    state = claim(state);
    expect(state.batch.attempts).toBe(number);
    expect(claim(state).batch.attempts).toBe(number);
    if (number === 1) state = act(state, { kind: 'failed', error: 'Incomplete implementation', retryBuilder: true });
    else {
      state = act(state, { kind: 'candidate', revision: revision(number) });
      state = act(state, { kind: 'report', report: report(state, 'verifier', false) });
      expect(state.phase).toBe('verify');
      state = act(state, { kind: 'report', report: report(state, 'reviewer') });
    }
  }
  expect(state.status).toBe('paused'); expect(state.blocker).toBe('budget');
  expect(() => claim(state)).toThrow(); expect(() => act(state, { kind: 'resume' })).toThrow();
  const ceiling = state.config.runtimeCeilingMs;
  state = act(state, { kind: 'continue' });
  expect(state.batch).toEqual({ number: 2, attempts: 0 }); expect(state.config.runtimeCeilingMs).toBe(ceiling);
});
test('Resume preserves reserved incomplete attempt; stale and duplicate actions cannot reserve twice', () => {
  let state = claim(start());
  const action: WorkflowAction = { kind: 'pause', id: 'pause', generation: state.generation, phase: state.phase };
  state = advanceWorkflow(state, action);
  expect(advanceWorkflow(state, action)).toBe(state);
  expect(() => act(state, { kind: 'candidate', revision: revision(1), generation: action.generation })).toThrow('stale');
  state = act(state, { kind: 'resume' }); state = claim(state);
  expect(state.batch.attempts).toBe(1);
});
test('unlimited Prototype rounds are outside Candidate budget and approvals name the current revision', () => {
  let state = createWorkflow(resolveBuildConfiguration(agent, agent, undefined, { discovered: true }), 'required');
  state = act(state, { kind: 'refined', requirements: [requirement], needsPrototype: true, ui: true });
  for (let number = 0; number < 5; number++) {
    const proto = `proto${number}`, artifactId = `artifact${number}`;
    state = act(state, { kind: 'prototyped', revision: { id: proto, artifactId, createdAt: Date.now() }, artifact: { id: artifactId, kind: 'prototype', path: `/tmp/${proto}.html`, mime: 'text/html', title: proto, revision: proto, batch: 1 } });
    state = act(state, { kind: 'comment', comment: { id: proto, revision: proto, text: 'Change layout', resolved: false, pin: { x: 0.3, y: 0.5 }, createdAt: Date.now() } });
    if (number < 4) state = act(state, { kind: 'requestRevision', revision: proto, text: 'Use comments' });
  }
  expect(state.batch.attempts).toBe(0);
  expect(() => act(state, { kind: 'approvePrototype', revision: 'proto0' })).toThrow('stale');
  state = act(state, { kind: 'approvePrototype', revision: 'proto4' }); expect(state.phase).toBe('plan');
});
test('both reports inspect one Candidate; passing requires execution and Requirement evidence', () => {
  let state = act(claim(start()), { kind: 'candidate', revision: revision(1) });
  expect(() => act(state, { kind: 'report', report: { ...report(state, 'reviewer'), revision: revision(2) } })).toThrow('stale');
  state = act(state, { kind: 'report', report: report(state, 'reviewer') }); expect(state.phase).toBe('verify');
  state = act(state, { kind: 'report', report: { ...report(state, 'verifier'), checks: [] } }); expect(state.status).toBe('paused'); expect(state.blocker).toBe('environment');
  state = act(state, { kind: 'resume' });
  state = act(state, { kind: 'report', report: report(state, 'verifier', false) });
  state = act(state, { kind: 'report', report: report(state, 'reviewer') }); expect(state.phase).toBe('build');
  state = act(claim(state), { kind: 'candidate', revision: revision(2) });
  state = act(state, { kind: 'report', report: report(state, 'verifier') });
  state = act(state, { kind: 'report', report: report(state, 'reviewer') }); expect(state.phase).toBe('publish');
});
test('environment failures pause after both reports; recovery does not renew slots', () => {
  let state = act(claim(start()), { kind: 'candidate', revision: revision(1) });
  state = act(state, { kind: 'report', report: { ...report(state, 'verifier'), environmentBlocker: 'Device unavailable' } });
  expect(state.status).toBe('running');
  state = act(state, { kind: 'report', report: report(state, 'reviewer') }); expect(state.blocker).toBe('environment');
  state = act(state, { kind: 'resume' }); expect(state.batch.attempts).toBe(1); expect(state.reports).toEqual({});
});
test('one PR survives batches; ordinary feedback does not launch; external drift invalidates evidence; only merge completes', () => {
  let state = act(claim(start()), { kind: 'candidate', revision: revision(1) });
  state = act(state, { kind: 'report', report: report(state, 'verifier') }); state = act(state, { kind: 'report', report: report(state, 'reviewer') });
  const pr = { url: 'https://github.com/a/b/pull/1', number: 1, repo: 'a/b', head: revision(1), state: 'open' as const };
  state = act(state, { kind: 'published', pr }); expect(state.status).toBe('waiting');
  state = act(state, { kind: 'feedback', feedback: { id: 'comment', source: 'github', text: 'Please change', authorized: false, changesDesign: false, createdAt: Date.now() } }); expect(state.phase).toBe('prReview');
  state = act(state, { kind: 'requestChanges', text: 'Fix search', changesDesign: false }); expect(state.batch.number).toBe(2);
  state = act(state, { kind: 'prSync', pr }); expect(state.status).toBe('running');
  state = act(state, { kind: 'prSync', pr: { ...pr, head: revision(2) } }); expect(state.status).toBe('paused');
  state = act(state, { kind: 'prSync', pr: { ...pr, head: revision(2), state: 'merged' } }); expect(state.status).toBe('done');
});
test('feedback during evaluation is serialized into next Batch; resource ceilings persist across batches', () => {
  let state = act(claim(start()), { kind: 'candidate', revision: revision(1) });
  state = act(state, { kind: 'requestChanges', text: 'Change approved layout', changesDesign: true });
  expect(state.phase).toBe('verify'); expect(state.batch.number).toBe(1);
  state = act(state, { kind: 'report', report: report(state, 'verifier') }); state = act(state, { kind: 'report', report: report(state, 'reviewer') });
  expect(state.phase).toBe('prototype'); expect(state.batch.number).toBe(2);
  state = act(state, { kind: 'resources', runtimeMs: state.config.runtimeCeilingMs });
  expect(state.blocker).toBe('resource'); expect(() => act(state, { kind: 'resume' })).toThrow();
});
test('material refinement decisions require an explicit answer and preserve Candidate budget', () => {
  let state = createWorkflow(resolveBuildConfiguration(agent, agent, undefined, { discovered: true }), 'auto');
  state = act(state, { kind: 'refined', requirements: [requirement], needsPrototype: false, ui: false, decision: 'Should search cover archived items?' });
  expect(state.status).toBe('paused'); expect(state.blocker).toBe('decision');
  expect(() => act(state, { kind: 'resume' })).toThrow();
  const generation = state.generation;
  state = act(state, { kind: 'answerDecision', text: 'Include archived items.' });
  expect(state.phase).toBe('refine'); expect(state.generation).toBe(generation + 1); expect(state.notes).toEqual(['Include archived items.']); expect(state.batch.attempts).toBe(0);
});
test('token-only and spending-only ceiling increases do not change runtime; decreases and no-ops are rejected', () => {
  let state = start(); const runtime = state.config.runtimeCeilingMs;
  state = act(state, { kind: 'raiseCeiling', tokenCeiling: 1000 });
  expect(state.config.runtimeCeilingMs).toBe(runtime);
  state = act(state, { kind: 'raiseCeiling', costCeilingCents: 200 });
  expect(state.config.runtimeCeilingMs).toBe(runtime);
  expect(() => act(state, { kind: 'raiseCeiling', tokenCeiling: 900, costCeilingCents: 300 })).toThrow('decrease');
  expect(() => act(state, { kind: 'raiseCeiling', runtimeCeilingMs: runtime })).toThrow('at least one');
  state = act(state, { kind: 'raiseCeiling', tokenCeiling: 2000 }); expect(state.config.tokenCeiling).toBe(2000);
});
test('external PR head changes invalidate ready evidence and reject Resume until an explicit new Batch', () => {
  let state = act(claim(start()), { kind: 'candidate', revision: revision(1) });
  state = act(state, { kind: 'report', report: report(state, 'verifier') });
  state = act(state, { kind: 'report', report: report(state, 'reviewer') });
  const pr = { url: 'https://github.com/a/b/pull/1', number: 1, repo: 'a/b', head: revision(1), state: 'open' as const };
  state = act(state, { kind: 'published', pr });
  const generation = state.generation;
  state = act(state, { kind: 'prSync', pr: { ...pr, head: revision(2) } });
  expect(state.status).toBe('paused'); expect(state.blocker).toBe('externalHead');
  expect(state.generation).toBe(generation + 1); expect(state.reports).toEqual({});
  expect(state.candidateRevision).toBe(revision(1)); expect(state.pr?.head).toBe(revision(2));
  expect(() => act(state, { kind: 'resume' })).toThrow('Request changes');
  state = act(state, { kind: 'requestChanges', text: 'Reconcile the external PR change and preserve existing behavior.', changesDesign: false });
  expect(state.phase).toBe('plan'); expect(state.status).toBe('running');
  expect(state.batch).toEqual({ number: 2, attempts: 0 }); expect(state.candidateRevision).toBeUndefined();
  expect(state.pr?.url).toBe(pr.url); expect(state.pr?.head).toBe(revision(2));
});
