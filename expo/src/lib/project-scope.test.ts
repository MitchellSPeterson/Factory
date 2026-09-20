import { expect, test } from 'bun:test';
import type { Id } from '@/lib/dataModel';
import { inProjectScope, parseScope, scopeLabel, storedValue } from './project-scope';

const factory = { _id: 'jd7factory' as Id<'projects'>, name: 'Factory' };
const other = { _id: 'jd7other' as Id<'projects'>, name: 'Other' };

test('empty stored value is View all', () => {
  expect(parseScope('', [factory])).toEqual({ kind: 'viewAll' });
});

test('a known Project id is Project scope', () => {
  expect(parseScope(factory._id, [factory, other])).toEqual({
    kind: 'project',
    projectId: factory._id,
  });
});

test('a deleted Project falls back to View all once the list has loaded', () => {
  expect(parseScope('jd7gone', [factory])).toEqual({ kind: 'viewAll' });
});

test('a stored id stays selected while Projects are still loading', () => {
  expect(parseScope(factory._id, undefined)).toEqual({
    kind: 'project',
    projectId: factory._id,
  });
});

test('inProjectScope keeps every row in View all', () => {
  expect(inProjectScope(factory._id, { kind: 'viewAll' })).toBe(true);
  expect(inProjectScope(other._id, { kind: 'viewAll' })).toBe(true);
});

test('inProjectScope keeps only the chosen Project', () => {
  const scope = { kind: 'project' as const, projectId: factory._id };
  expect(inProjectScope(factory._id, scope)).toBe(true);
  expect(inProjectScope(other._id, scope)).toBe(false);
});

test('storedValue round-trips View all and a Project', () => {
  expect(storedValue({ kind: 'viewAll' })).toBe('');
  expect(storedValue({ kind: 'project', projectId: factory._id })).toBe(factory._id);
});

test('scopeLabel uses View all or the Project name', () => {
  expect(scopeLabel({ kind: 'viewAll' }, undefined)).toBe('View all');
  expect(scopeLabel({ kind: 'project', projectId: factory._id }, factory)).toBe('Factory');
  expect(scopeLabel({ kind: 'project', projectId: factory._id }, undefined)).toBe('Project');
});
