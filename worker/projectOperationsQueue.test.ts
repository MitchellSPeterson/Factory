import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { api } from '../shared/mailboxApi';
import { localMailbox } from './mailbox/client';
import { openStore, type Store } from './mailbox/store';
const directories: string[] = [], stores: Store[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const key = 'a'.repeat(64);

test('status queued after a commit runs after it, so the Git page sees the commit', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'ops-queue-')); directories.push(dir);
  const store = openStore(path.join(dir, 'mailbox.sqlite')); stores.push(store);
  const client = localMailbox(store, path.join(dir, 'uploads'));
  await client.mutation(api.servers.register, { accessKey: key, publicKey: 'test', projectsRoot: dir, name: 'test' });
  const projectId = await client.mutation(api.projects.create, { name: 'Test', kind: 'web', localPath: dir, githubRepo: 'a/b', defaultRuntime: 'local' });
  const enqueue = (operation: object) => client.mutation(api.projectOperations.enqueue, { projectId, operation } as never);
  const stale = await enqueue({ kind: 'status' });
  const commit = await enqueue({ kind: 'commit', message: 'm', paths: ['a'], expectedBranch: 'main' });
  const fresh = await enqueue({ kind: 'status' });
  expect(fresh).not.toBe(stale);
  const order: string[] = [];
  for (let task; (task = await client.mutation(api.projectOperations.claim, { accessKey: key })); ) {
    order.push(task._id);
    await client.mutation(api.projectOperations.update, { accessKey: key, id: task._id, output: '', result: { kind: 'text', text: '' } } as never);
  }
  expect(order).toEqual([stale, commit, fresh]);
});
