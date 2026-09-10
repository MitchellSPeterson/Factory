import { WorkerSettings } from "../servers/WorkerSettings";
import { AddGitHubProject } from "../servers/AddGitHubProject";
import { useServer } from "../servers/connection";
import { useMutation, useQuery } from "convex/react";
import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useProjectScope, useTheme } from "../projectScope";

import { GitHubConnection } from "../github/GitHubConnection";
import { RepositoryField } from "../github/RepositoryField";

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab");
  const tab = (["general", "github", "projects", "providers"] as const).includes(requestedTab as SettingsTab) ? requestedTab as SettingsTab : "general";
  const { accessKey } = useServer();
  const projects = useQuery(api.projects.list);
  const recipes = useQuery(api.recipes.list);
  const create = useMutation(api.projects.create);
  const remove = useMutation(api.projects.remove);
  const { projectId, setProjectId } = useProjectScope();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [kind, setKind] = useState<"expo" | "web" | "mixed">("mixed");
  const [runtime, setRuntime] = useState<"local" | "cloud">("local");
  const [recipeId, setRecipeId] = useState("");

  async function addProject(event: FormEvent) {
    event.preventDefault();
    const created = await create({ name, localPath, githubRepo, kind, defaultRuntime: runtime, recipeId: recipeId === "" ? undefined : recipeId as Id<"recipes"> });
    setProjectId(created);
    setName(""); setLocalPath(""); setGithubRepo(""); setRecipeId("");
  }
  async function removeProject(id: Id<"projects">, name: string) {
    if (!window.confirm(`Remove ${name} from Factory? Existing Jobs will remain, but will no longer have this Project.`)) return;
    await remove({ projectId: id, accessKey: accessKey || undefined });
    if (projectId === id) setProjectId("");
  }

  function selectTab(value: SettingsTab) { setParams(value === "general" ? {} : { tab: value }); }

  return <>
    <div className="pagehead"><div><p className="eyebrow">Settings</p><h1>{tabLabel(tab)}</h1><p className="muted">{tabDescription(tab)}</p></div></div>
    <nav className="settings-tabs" aria-label="Settings sections">{(["general", "github", "projects", "providers"] as const).map(value => <button type="button" key={value} className={tab === value ? "active" : ""} aria-current={tab === value ? "page" : undefined} onClick={() => selectTab(value)}>{tabLabel(value)}</button>)}</nav>
    {tab === "general" && <section className="settings-section"><div className="section-heading"><div><h2>Appearance</h2><p>Choose the color mode that is easiest on your eyes.</p></div></div>
      <div className="settings-option"><div><strong>Color mode</strong><span>{theme === "dark" ? "Dark mode is active" : "Light mode is active"}</span></div><div className="theme-toggle" aria-label="Color mode"><button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")} type="button">Dark</button><button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")} type="button">Light</button></div></div>
    </section>}
    {tab === "github" && <><GitHubConnection /><AddGitHubProject /></>}
    {tab === "providers" && <WorkerSettings />}
    {tab === "projects" && <><section className="settings-section"><div className="section-heading"><div><h2>Connected Projects</h2><p>Use the sidebar switcher to choose your active Project.</p></div></div>
      <div className="settings-project-list">
        {projects?.map((project) => <div className="settings-project" key={project._id}><div><strong>{project.name}</strong><span>{project.githubRepo || project.localPath}{project.cloneStatus ? ` · ${project.cloneStatus}` : ""}</span></div><div className="row"><Link className="text-button" to={`/projects/${project._id}`}>Edit</Link><button className="danger-button" type="button" onClick={() => void removeProject(project._id, project.name)}>Remove</button></div></div>)}
      </div>
    </section>
    <section className="settings-section add-project"><div className="section-heading"><div><h2>Add existing local Project</h2><p>Register the repository a Job should run against.</p></div></div>
      <form className="project-form" onSubmit={(event) => void addProject(event)}>
        <label>Name<input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Factory" /></label>
        <label>Local path<input required value={localPath} onChange={(event) => setLocalPath(event.target.value)} placeholder="/Users/you/Projects/Factory" /></label>
        <RepositoryField value={githubRepo} onChange={setGithubRepo} />
        <label>Kind<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="mixed">mixed</option><option value="web">web</option><option value="expo">expo</option></select></label>
        <label>Default runtime<select value={runtime} onChange={(event) => setRuntime(event.target.value as typeof runtime)}><option value="local">local</option><option value="cloud">cloud</option></select></label>
        <label>Workflow<select value={recipeId} onChange={(event) => setRecipeId(event.target.value)}><option value="">Feature (default)</option>{recipes?.map((recipe) => <option key={recipe._id} value={recipe._id}>{recipe.name}</option>)}</select></label>
        <button type="submit">Add project</button>
      </form>
    </section></>}
  </>;
}

type SettingsTab = "general" | "github" | "projects" | "providers";
function tabLabel(tab: SettingsTab) { return tab === "github" ? "GitHub" : tab[0]!.toUpperCase() + tab.slice(1); }
function tabDescription(tab: SettingsTab) {
  if (tab === "github") return "Connect GitHub and import repositories into VASA.";
  if (tab === "projects") return "Add a repository to VASA or remove one you no longer work on.";
  if (tab === "providers") return "Authenticate the Agent providers that run Jobs on this machine.";
  return "Manage VASA’s workspace preferences.";
}
