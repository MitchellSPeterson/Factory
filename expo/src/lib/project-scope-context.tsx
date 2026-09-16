import { useQuery } from 'convex/react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api } from '@/lib/api';
import {
  parseScope,
  scopeLabel,
  storedValue,
  type ProjectOption,
  type ProjectScope,
} from '@/lib/project-scope';
import { readStored, writeStored } from '@/lib/project-scope-storage';

type ProjectScopeValue = {
  scope: ProjectScope;
  setScope: (scope: ProjectScope) => void;
  projects: ProjectOption[] | undefined;
  currentProject: ProjectOption | undefined;
  label: string;
};

const ProjectScopeContext = createContext<ProjectScopeValue | null>(null);

export function ProjectScopeProvider({ children }: { children: ReactNode }) {
  const projects = useQuery(api.projects.list);
  const [stored, setStored] = useState(readStored);

  const scope = useMemo(() => parseScope(stored, projects), [stored, projects]);
  const currentProject = useMemo(() => {
    if (scope.kind !== 'project' || projects === undefined) return undefined;
    return projects.find((project) => project._id === scope.projectId);
  }, [projects, scope]);

  const setScope = useCallback((next: ProjectScope) => {
    const value = storedValue(next);
    setStored(value);
    writeStored(value);
  }, []);

  useEffect(() => {
    if (projects === undefined) return;
    if (stored === '' || scope.kind !== 'viewAll') return;
    setStored('');
    writeStored('');
  }, [projects, scope, stored]);

  const value = useMemo<ProjectScopeValue>(
    () => ({
      scope,
      setScope,
      projects,
      currentProject,
      label: scopeLabel(scope, currentProject),
    }),
    [currentProject, projects, scope, setScope],
  );

  return <ProjectScopeContext.Provider value={value}>{children}</ProjectScopeContext.Provider>;
}

export function useProjectScope() {
  const value = useContext(ProjectScopeContext);
  if (value === null) {
    throw new Error('useProjectScope must be used within ProjectScopeProvider');
  }
  return value;
}
