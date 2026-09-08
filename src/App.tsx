import type { ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { GitHubPage } from "./pages/GitHubPage";
import { DashboardPage } from "./pages/DashboardPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProjectScopeContext, ThemeContext, type ProjectScope } from "./projectScope";
import { JobPage } from "./pages/JobPage";
import { JobsPage } from "./pages/JobsPage";
import { NewJobPage } from "./pages/NewJobPage";
import { NewJobModal } from "./NewJobModal";
import { ProjectPage } from "./pages/ProjectPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { RecipePage } from "./pages/RecipePage";
import { RecipesPage } from "./pages/RecipesPage";
import { SkillPage } from "./pages/SkillPage";
import { AgentsPage } from "./pages/AgentsPage";
import { SkillsPage } from "./pages/SkillsPage";

function IconJobs() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="2.5"
        y="4"
        width="11"
        height="9.5"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M5 4V3a3 3 0 0 1 6 0v1"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function IconDashboard() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4"/><rect x="9" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4"/></svg>; }
function IconSettings() { return <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.4"/><path d="M8 2.1v1.4m0 9v1.4m5.9-6H12.5m-9 0H2.1m10.07-4.17-1 1m-6.14 6.14-1 1m8.14 0-1-1M4.93 4.83l-1-1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }

function IconWorkflows() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4" cy="4" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="8" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="4" cy="12" r="1.7" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M5.7 4.6 10.3 7.4M5.7 11.4 10.3 8.6"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function IconSkills() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.5 9.2 6h3.6L10 8.3l1 3.5L8 9.8 4.9 11.8l1-3.5L3.2 6h3.6L8 2.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAV: { section: string; items: { to: string; label: string; icon: ReactNode }[] }[] =
  [
    {
      section: "Work",
      items: [{ to: "/dashboard", label: "Dashboard", icon: <IconDashboard /> }, { to: "/jobs", label: "Jobs", icon: <IconJobs /> }, { to: "/github", label: "GitHub", icon: <IconWorkflows /> }],
    },
    {
      section: "Build",
      items: [
        { to: "/workflows", label: "Workflows", icon: <IconWorkflows /> },
        { to: "/agents", label: "Agents", icon: <IconJobs /> },
        { to: "/skills", label: "Skills", icon: <IconSkills /> },
      ],
    },
  ];

export function App() {
  const projects = useQuery(api.projects.list);
  const navigate = useNavigate();
  const location = useLocation();
  const [projectId, setProjectIdState] = useState<ProjectScope>(() => (localStorage.getItem("factory-project-scope") ?? "") as ProjectScope);
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("factory-theme") as "dark" | "light") ?? "dark");
  const [newJobOpen, setNewJobOpen] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("factory-theme", theme); }, [theme]);
  const setProjectId = (id: ProjectScope) => { setProjectIdState(id); localStorage.setItem("factory-project-scope", id); if (location.pathname !== "/github") navigate("/dashboard"); };
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}><ProjectScopeContext.Provider value={{ projectId, setProjectId }}><div className="shell">
      <aside className="sidebar">
        <NavLink to="/jobs" className="brand" end>
          <img className="brand-mark" src="/vasa.svg" alt="VASA" />
          <span className="brand-tagline">Agentic Software Factory</span>
        </NavLink>
        <label className="project-switcher"><span>Working on</span><select value={projectId} onChange={(event) => setProjectId(event.target.value as ProjectScope)}><option value="">View all</option>{projects?.map((project) => <option key={project._id} value={project._id}>{project.name}</option>)}</select></label>
        <nav>
          {NAV.map((group) => (
            <div className="nav-group" key={group.section}>
              <div className="nav-label">{group.section}</div>
              {group.items.map((item) => (
                <NavLink to={item.to} key={item.to}>
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom"><NavLink to="/settings" className="settings-link"><IconSettings />Settings</NavLink></div>
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage onNewJob={() => setNewJobOpen(true)} />} />
          <Route path="/jobs" element={<JobsPage onNewJob={() => setNewJobOpen(true)} />} />
          <Route path="/jobs/new" element={<NewJobPage />} />
          <Route path="/jobs/:jobId" element={<JobPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/recipe" element={<Navigate to="/workflows" replace />} />
          <Route path="/recipes" element={<Navigate to="/workflows" replace />} />
          <Route path="/recipes/:recipeId" element={<RecipeRedirect />} />
          <Route path="/workflows" element={<RecipesPage />} />
          <Route path="/workflows/:recipeId" element={<RecipePage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/skills/:skillId" element={<SkillPage />} />
          <Route path="/github" element={<GitHubPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
      {newJobOpen ? <NewJobModal projectId={projectId} onClose={() => setNewJobOpen(false)} onComplete={(jobId) => { setNewJobOpen(false); navigate(`/jobs/${jobId}`); }} /> : null}
    </div></ProjectScopeContext.Provider></ThemeContext.Provider>
  );
}

function RecipeRedirect() {
  const { recipeId } = useParams<{ recipeId: string }>();
  return <Navigate to={`/workflows/${recipeId ?? ""}`} replace />;
}
