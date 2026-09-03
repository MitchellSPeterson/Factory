import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { JobPage } from "./pages/JobPage";
import { JobsPage } from "./pages/JobsPage";
import { NewJobPage } from "./pages/NewJobPage";
import { ProjectPage } from "./pages/ProjectPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { RecipePage } from "./pages/RecipePage";
import { RecipesPage } from "./pages/RecipesPage";
import { SkillPage } from "./pages/SkillPage";
import { SkillsPage } from "./pages/SkillsPage";

function Mark() {
  return (
    <svg width="32" height="32" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="currentColor" />
      <path
        fill="#0d1117"
        d="M5.2 10.4V5.6h1.5c1.4 0 2.2.7 2.2 1.8 0 .7-.4 1.3-1 1.5l1.2 1.5H7.6L6.6 8.8H6.4v1.6zm1.2-2.5h.3c.6 0 1-.3 1-.8s-.4-.8-1-.8h-.3z"
      />
    </svg>
  );
}

export function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/jobs" className="brand" end>
          <Mark />
          Factory
        </NavLink>
        <nav className="links">
          <NavLink to="/jobs">Jobs</NavLink>
          <NavLink to="/projects">Projects</NavLink>
          <NavLink to="/recipes">Recipes</NavLink>
          <NavLink to="/skills">Skills</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/new" element={<NewJobPage />} />
          <Route path="/jobs/:jobId" element={<JobPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:projectId" element={<ProjectPage />} />
          <Route path="/recipe" element={<Navigate to="/recipes" replace />} />
          <Route path="/recipes" element={<RecipesPage />} />
          <Route path="/recipes/:recipeId" element={<RecipePage />} />
          <Route path="/skills" element={<SkillsPage />} />
          <Route path="/skills/:skillId" element={<SkillPage />} />
        </Routes>
      </main>
    </div>
  );
}
