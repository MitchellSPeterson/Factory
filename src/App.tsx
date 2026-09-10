import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
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
import { SessionsPage } from "./pages/SessionsPage";
import { SessionPage } from "./pages/SessionPage";
import { Sidebar } from "./Sidebar";

export function App() {
  const projects = useQuery(api.projects.list);
  const navigate = useNavigate();
  const [projectId, setProjectIdState] = useState<ProjectScope>(() => (localStorage.getItem("factory-project-scope") ?? "") as ProjectScope);
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("factory-theme") as "dark" | "light") ?? "dark");
  const [newJobOpen, setNewJobOpen] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("factory-theme", theme); }, [theme]);
  const setProjectId = (id: ProjectScope) => { setProjectIdState(id); localStorage.setItem("factory-project-scope", id); navigate("/dashboard"); };
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}><ProjectScopeContext.Provider value={{ projectId, setProjectId }}><div className="shell">
      <Sidebar projects={projects} projectId={projectId} onProjectIdChange={setProjectId} />
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage onNewJob={() => setNewJobOpen(true)} />} />
          <Route path="/ask" element={<Navigate to="/sessions" replace />} />
          <Route path="/asks" element={<Navigate to="/sessions" replace />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/sessions/:sessionId" element={<SessionPage />} />
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
          <Route path="/github" element={<Navigate to="/settings?tab=github" replace />} />
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
