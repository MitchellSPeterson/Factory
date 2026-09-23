import type { Doc, Id } from '@/lib/dataModel';

export type ProjectScope =
  | { kind: 'viewAll' }
  | { kind: 'project'; projectId: Id<'projects'> };

export type ProjectOption = Pick<
  Doc<'projects'>,
  '_id' | 'name' | 'localPath' | 'githubRepo' | 'kind'
>;

export function parseScope(
  stored: string,
  _projects?: { _id: Id<'projects'> }[] | undefined,
): ProjectScope {
  if (stored === '') return { kind: 'viewAll' };
  return { kind: 'project', projectId: asProjectId(stored) };
}

export function storedValue(scope: ProjectScope): string {
  switch (scope.kind) {
    case 'viewAll':
      return '';
    case 'project':
      return scope.projectId;
    default: {
      const _exhaustive: never = scope;
      return _exhaustive;
    }
  }
}

export function inProjectScope(projectId: string, scope: ProjectScope): boolean {
  switch (scope.kind) {
    case 'viewAll':
      return true;
    case 'project':
      return projectId === scope.projectId;
    default: {
      const _exhaustive: never = scope;
      return _exhaustive;
    }
  }
}

export function scopeLabel(scope: ProjectScope, project: ProjectOption | undefined): string {
  switch (scope.kind) {
    case 'viewAll':
      return 'View all';
    case 'project':
      return project?.name ?? 'Project';
    default: {
      const _exhaustive: never = scope;
      return _exhaustive;
    }
  }
}

function asProjectId(stored: string): Id<'projects'> {
  if (stored === '') {
    throw new Error('View all has no Project id');
  }
  return stored as Id<'projects'>;
}
