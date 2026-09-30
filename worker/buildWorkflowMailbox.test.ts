import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { api } from '../shared/mailboxApi';
import { type WorkflowAction, type WorkflowState } from '../shared/buildWorkflow';
import { localMailbox, type Mailbox } from './mailbox/client';
import { openStore, type Store } from './mailbox/store';
const directories: string[] = [], stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const key = 'a'.repeat(64), agent = { provider: 'codex' as const, model: 'gpt-5', effort: 'high' as const };
async function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'workflow-mailbox-')); directories.push(dir);
  const file = path.join(dir, 'mailbox.sqlite'), store = openStore(file); stores.push(store);
  const client = localMailbox(store, path.join(dir, 'uploads'));
  await client.mutation(api.servers.register, { accessKey: key, publicKey: 'test', projectsRoot: dir, name: 'test' });
  const projectId = await client.mutation(api.projects.create, { name: 'Test', kind: 'web', localPath: dir, githubRepo: 'a/b', defaultRuntime: 'local' });
  const itemId = await client.mutation(api.roadmap.createItem, { projectId, kind: 'feature', title: 'Search' });
  const buildId = await client.mutation(api.builds.create, { roadmapItemId: itemId, agent, reviewer: agent, checkCommand: 'bun test', config: { discovered: true }, prototypeMode: 'skip' });
  let source = (await client.query(api.builds.get, { buildId }))!.workflow!;
  const send = async (action: object) => {
    const result = { id: crypto.randomUUID(), generation: source.generation, phase: source.phase, ...action } as WorkflowAction;
    await client.mutation(api.builds.updateWorkflow, { buildId, accessKey: key, action: result });
    source = (await client.query(api.builds.get, { buildId }))!.workflow!;
    return result;
  };
  await send({ kind: 'refined', requirements: [{ id: 'r1', text: 'Search matches', done: false }], ui: false, needsPrototype: false });
  await send({ kind: 'planned', checkpoints: [{ title: 'Search', description: 'Search matches', tests: 'Search results', ui: false }] });
  return { dir, file, store, client, buildId, projectId, itemId, source, send };
}
test('claim creates Session and reserves one slot atomically, deduplicates concurrent delivery and persists after reopen', async () => {
  const f = await fixture();
  const claim = { buildId: f.buildId, accessKey: key, generation: f.source.generation, phase: f.source.phase, role: 'builder' as const, text: 'Implement search', cwd: f.dir };
  const sessions = await Promise.all(Array.from({ length: 8 }, () => f.client.mutation(api.builds.claimWorkflowStage, claim)));
  expect(new Set(sessions).size).toBe(1);
  expect(f.store.list('sessions')).toHaveLength(1);
  expect((f.store.get(f.buildId)!.workflow as WorkflowState).batch.attempts).toBe(1);
  f.store.close(); stores.splice(stores.indexOf(f.store), 1);
  const reopened = openStore(f.file); stores.push(reopened);
  const client = localMailbox(reopened, path.join(f.dir, 'uploads'));
  expect(await client.mutation(api.builds.claimWorkflowStage, claim)).toBe(sessions[0]);
  expect(reopened.list('sessions')).toHaveLength(1);
  expect(await client.mutation(api.builds.claimWorkflowStage, { ...claim, generation: claim.generation - 1 })).toBeNull();
});
test('failed atomic claim rolls back Session, message and budget and exposes no partial notification', async () => {
  const f = await fixture(); let notifications = 0;
  f.store.subscribe(() => notifications++);
  // Force a late failure after the Session/message and Build reservation have been written.
  f.store.patch(f.buildId, { roadmapItemId: 'missing' }); notifications = 0;
  await expect(f.client.mutation(api.builds.claimWorkflowStage, { buildId: f.buildId, accessKey: key, generation: f.source.generation, phase: f.source.phase, role: 'builder', text: 'Implement', cwd: f.dir })).rejects.toThrow('Roadmap item not found');
  expect(f.store.list('sessions')).toHaveLength(0); expect(f.store.list('sessionMessages')).toHaveLength(0);
  expect((f.store.get(f.buildId)!.workflow as WorkflowState).batch.attempts).toBe(0); expect(notifications).toBe(0);
});
test('trusted Factory control and Worker results cannot forge each other; duplicate action IDs are durable', async () => {
  const f = await fixture();
  const source = { id: 'pause', generation: f.source.generation, phase: f.source.phase };
  await expect(f.client.mutation(api.builds.updateWorkflow, { buildId: f.buildId, accessKey: key, action: { ...source, kind: 'pause' } })).rejects.toThrow('Factory input');
  await expect(f.client.mutation(api.builds.action, { buildId: f.buildId, action: { ...source, kind: 'candidate', revision: 'a'.repeat(40) } })).rejects.toThrow('Worker');
  await expect(f.client.mutation(api.builds.updateWorkflow, { buildId: f.buildId, accessKey: 'b'.repeat(64), action: { ...source, kind: 'failed', error: 'failure' } })).rejects.toThrow('identity');
  await f.client.mutation(api.builds.action, { buildId: f.buildId, action: { ...source, kind: 'pause' } });
  await f.client.mutation(api.builds.action, { buildId: f.buildId, action: { ...source, kind: 'pause' } });
  const workflow = (await f.client.query(api.builds.get, { buildId: f.buildId }))!.workflow!;
  expect(workflow.actionIds.filter(id => id === 'pause')).toHaveLength(1);
});
test('legacy persisted Builds keep their original machine and merged v2 PR alone marks Roadmap Done', async () => {
  const f = await fixture();
  f.store.patch(f.buildId, { workflow: undefined });
  await f.client.mutation(api.builds.send, { buildId: f.buildId, event: { kind: 'planned', checkpoints: [{ title: 'Legacy', description: '', tests: '', ui: false }] } });
  expect((await f.client.query(api.builds.get, { buildId: f.buildId }))!.step.kind).toBe('approvePlan');
  const state = structuredClone(f.source);
  state.phase = 'prReview'; state.status = 'waiting'; state.candidateRevision = 'a'.repeat(40); state.pr = { url: 'https://github.com/a/b/pull/1', repo: 'a/b', number: 1, head: 'a'.repeat(40), state: 'open' };
  f.store.patch(f.buildId, { workflow: state });
  expect((await f.client.query(api.roadmap.getItem, { itemId: f.itemId }))!.status).toBe('in_progress');
  await f.client.mutation(api.builds.updateWorkflow, { buildId: f.buildId, accessKey: key, action: { id: 'merged', phase: 'prReview', generation: state.generation, kind: 'prSync', pr: { ...state.pr, state: 'merged' } } });
  expect((await f.client.query(api.roadmap.getItem, { itemId: f.itemId }))!.status).toBe('done');
});
test('ready and paused PR review stays scheduled for sync; paused review feedback cannot launch work until Resume', async () => {
  const f = await fixture();
  const state = structuredClone(f.source); state.phase = 'prReview'; state.status = 'waiting'; state.candidateRevision = 'a'.repeat(40);
  state.pr = { url: 'https://github.com/a/b/pull/1', repo: 'a/b', number: 1, head: state.candidateRevision, state: 'open' };
  f.store.patch(f.buildId, { workflow: state, status: state.status });
  expect((await f.client.query(api.builds.listActive, { accessKey: key })).map(build => build._id)).toContain(f.buildId);
  // Pause the review explicitly using preserved state, as human Pause normally applies to active execution.
  state.status = 'paused'; state.blocker = 'interrupted'; f.store.patch(f.buildId, { workflow: state, status: state.status });
  expect((await f.client.query(api.builds.listActive, { accessKey: key })).map(build => build._id)).toContain(f.buildId);
  const feedback = { id: 'review1', reviewId: 'review1', source: 'github' as const, authorized: true, text: 'Fix matching', changesDesign: false, createdAt: Date.now() };
  await f.client.mutation(api.builds.updateWorkflow, { buildId: f.buildId, accessKey: key, action: { id: 'paused-review-delivery', generation: state.generation, phase: 'prReview', kind: 'prSync', pr: state.pr, feedback: [feedback] } });
  let workflow = (await f.client.query(api.builds.get, { buildId: f.buildId }))!.workflow!;
  expect(workflow.status).toBe('paused'); expect(workflow.phase).toBe('prReview'); expect(workflow.batch.number).toBe(1); expect(workflow.pendingFeedback).toContainEqual(feedback);
  await f.client.mutation(api.builds.action, { buildId: f.buildId, action: { id: 'resume-pr', generation: workflow.generation, phase: 'prReview', kind: 'resume' } });
  workflow = (await f.client.query(api.builds.get, { buildId: f.buildId }))!.workflow!;
  await f.client.mutation(api.builds.updateWorkflow, { buildId: f.buildId, accessKey: key, action: { id: 'drain-resumed-review', generation: workflow.generation, phase: 'prReview', kind: 'prSync', pr: state.pr } });
  workflow = (await f.client.query(api.builds.get, { buildId: f.buildId }))!.workflow!;
  expect(workflow.phase).toBe('plan'); expect(workflow.batch.number).toBe(2);
  f.store.patch(f.buildId, { status: 'stopped', workflow: { ...workflow, phase: 'prReview', status: 'stopped' } });
  expect((await f.client.query(api.builds.listActive, { accessKey: key })).map(build => build._id)).not.toContain(f.buildId);
});
