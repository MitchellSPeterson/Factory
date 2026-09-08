import type { ReactNode } from "react";
import { NavLink, Navigate, Route, Routes, useParams } from "react-router-dom";
import { JobPage } from "./pages/JobPage";
import { JobsPage } from "./pages/JobsPage";
import { NewJobPage } from "./pages/NewJobPage";
import { ProjectPage } from "./pages/ProjectPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { RecipePage } from "./pages/RecipePage";
import { RecipesPage } from "./pages/RecipesPage";
import { SkillPage } from "./pages/SkillPage";
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

function IconProjects() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 5.5V12a1.5 1.5 0 0 0 1.5 1.5h8A1.5 1.5 0 0 0 13.5 12V5.5h-11Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M2.5 5.5 4 2.5h3.2L8.5 5.5h-6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
      items: [{ to: "/jobs", label: "Jobs", icon: <IconJobs /> }],
    },
    {
      section: "Build",
      items: [
        { to: "/projects", label: "Projects", icon: <IconProjects /> },
        { to: "/workflows", label: "Workflows", icon: <IconWorkflows /> },
        { to: "/skills", label: "Skills", icon: <IconSkills /> },
      ],
    },
  ];

export function App() {
  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/jobs" className="brand" end>
          <img className="brand-mark" src="/vasa.svg" alt="VASA" />
          <span className="brand-tagline">Agentic Software Factory</span>
        </NavLink>
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
      </aside>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/new" element={<NewJobPage />} />
          <Route path="/jobs/:jobId" element={<JobPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/recipe" element={<Navigate to="/workflows" replace />} />
          <Route path="/recipes" element={<Navigate to="/workflows" replace />} />
          <Route path="/recipes/:recipeId" element={<RecipeRedirect />} />
          <Route path="/workflows" element={<RecipesPage />} />
          <Route path="/workflows/:recipeId" element={<RecipePage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/skills/:skillId" element={<SkillPage />} />
        </Routes>
      </main>
    </div>
  );
}

function RecipeRedirect() {
  const { recipeId } = useParams<{ recipeId: string }>();
  return <Navigate to={`/workflows/${recipeId ?? ""}`} replace />;
}
