import { WorkerPairing, ProviderCards, EnvironmentManager } from "../servers/WorkerSettings";
import { AddGitHubProject } from "../servers/AddGitHubProject";
import { useServer } from "../servers/connection";
import { useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useProjectScope, useTheme } from "../projectScope";
import { GitHubConnection } from "../github/GitHubConnection";
import { useGitHub } from "../github/connection";
import { RepositoryField } from "../github/RepositoryField";
import {
  githubStatus,
  machineStatus,
  projectsStatus,
  sectionIdForTab,
  type ConnectionStatus,
  type SettingsTab,
} from "./settingsReadiness";

const MACHINE_ONLINE_MS = 45000;

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab");

  useEffect(() => {
    const id = sectionIdForTab(requestedTab);
    if (!id) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, [requestedTab]);

  function selectSection(tab: SettingsTab) {
    setParams(tab === "general" ? {} : { tab });
  }

  return (
    <div className="settings-page">
      <header className="settings-head">
        <h1>Settings</h1>
        <p className="muted">Whether this Factory can run a Job.</p>
      </header>
      <Readout onSelect={selectSection} />
      <GitHubConnection />
      <WorkerPairing />
      <ProjectsBlock />
      <ProvidersBlock />
      <AppearanceBlock />
    </div>
  );
}

function Readout({ onSelect }: { onSelect: (tab: SettingsTab) => void }) {
  const { connection } = useGitHub();
  const { server, accessKey } = useServer();
  const live = useQuery(api.servers.paired, server ? { accessKey } : "skip");
  const projects = useQuery(api.projects.list);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const github = githubStatus(connection === undefined ? undefined : connection?.login ?? null);
  const machine = machineStatus({
    name: server === undefined ? undefined : server?.name ?? null,
    online: !!(live && now - live.lastSeen < MACHINE_ONLINE_MS),
  });
  const projectsState = projectsStatus(projects === undefined ? undefined : projects.length);

  return (
    <nav className="settings-readout" aria-label="Factory readiness">
      <ReadoutItem status={github} onClick={() => onSelect("github")} />
      <ReadoutItem status={machine} onClick={() => onSelect("providers")} />
      <ReadoutItem status={projectsState} onClick={() => onSelect("projects")} />
    </nav>
  );
}

function ReadoutItem({ status, onClick }: { status: ConnectionStatus; onClick: () => void }) {
  return (
    <button type="button" className={`settings-readout-item ${status.kind}`} onClick={onClick}>
      <span className="settings-readout-dot" aria-hidden="true" />
      <span className="settings-readout-copy">
        <strong>{status.label}</strong>
        {status.detail}
      </span>
    </button>
  );
}

function ProjectsBlock() {
  const { accessKey } = useServer();
  const projects = useQuery(api.projects.list);
  const recipes = useQuery(api.recipes.list);
  const create = useMutation(api.projects.create);
  const remove = useMutation(api.projects.remove);
  const { projectId, setProjectId } = useProjectScope();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [localPath, setLocalPath] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [kind, setKind] = useState<"expo" | "web" | "mixed">("mixed");
  const [runtime, setRuntime] = useState<"local" | "cloud">("local");
  const [recipeId, setRecipeId] = useState("");
  const empty = projects !== undefined && projects.length === 0;
  const showAdd = adding || empty;

  async function addProject(event: FormEvent) {
    event.preventDefault();
    const created = await create({
      name,
      localPath,
      githubRepo,
      kind,
      defaultRuntime: runtime,
      recipeId: recipeId === "" ? undefined : (recipeId as Id<"recipes">),
    });
    setProjectId(created);
    setName("");
    setLocalPath("");
    setGithubRepo("");
    setRecipeId("");
    setAdding(false);
  }

  async function removeProject(id: Id<"projects">, projectName: string) {
    if (!window.confirm(`Remove ${projectName} from Factory? Existing Jobs will remain, but will no longer have this Project.`)) return;
    await remove({ projectId: id, accessKey: accessKey || undefined });
    if (projectId === id) setProjectId("");
  }

  return (
    <section id="projects" className="settings-block">
      <div className="section-heading">
        <div>
          <h2>Projects</h2>
          <p>Repos a Job can run against. Switch the active one in the sidebar.</p>
        </div>
      </div>
      <div className="settings-project-list">
        {projects === undefined ? (
          <div className="settings-project">
            <div>
              <strong>Loading Projects…</strong>
            </div>
          </div>
        ) : null}
        {projects?.map((project) => (
          <div className="settings-project" key={project._id}>
            <div>
              <strong>{project.name}</strong>
              <span>
                {project.githubRepo || project.localPath}
                {project.cloneStatus ? ` · ${project.cloneStatus}` : ""}
              </span>
            </div>
            <div className="row">
              <Link className="text-button" to={`/projects/${project._id}`}>
                Edit
              </Link>
              <button className="danger-button" type="button" onClick={() => void removeProject(project._id, project.name)}>
                Remove
              </button>
            </div>
          </div>
        ))}
        {empty ? (
          <div className="settings-project">
            <div>
              <strong>No Projects yet</strong>
              <span>Add a GitHub repository or a folder on this machine.</span>
            </div>
          </div>
        ) : null}
      </div>
      {projects === undefined ? null : showAdd ? (
        <div className="settings-add">
          <AddGitHubProject />
          <section className="settings-section add-project">
            <div className="section-heading">
              <div>
                <h2>Add a local Project</h2>
                <p>Register a repository that already lives on this machine.</p>
              </div>
            </div>
            <form className="project-form" onSubmit={(event) => void addProject(event)}>
              <label>
                Name
                <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Factory" />
              </label>
              <label>
                Local path
                <input required value={localPath} onChange={(event) => setLocalPath(event.target.value)} placeholder="/Users/you/Projects/Factory" />
              </label>
              <RepositoryField value={githubRepo} onChange={setGithubRepo} />
              <label>
                Kind
                <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
                  <option value="mixed">Web and Expo</option>
                  <option value="web">Web</option>
                  <option value="expo">Expo</option>
                </select>
              </label>
              <label>
                Where Jobs run
                <select value={runtime} onChange={(event) => setRuntime(event.target.value as typeof runtime)}>
                  <option value="local">This machine</option>
                  <option value="cloud">Cloud</option>
                </select>
              </label>
              <label>
                Workflow
                <select value={recipeId} onChange={(event) => setRecipeId(event.target.value)}>
                  <option value="">Feature (default)</option>
                  {recipes?.map((recipe) => (
                    <option key={recipe._id} value={recipe._id}>
                      {recipe.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit">Add project</button>
            </form>
          </section>
          {empty ? null : (
            <button className="ghost" type="button" onClick={() => setAdding(false)}>
              Cancel
            </button>
          )}
        </div>
      ) : (
        <button className="ghost settings-add-toggle" type="button" onClick={() => setAdding(true)}>
          + Add Project
        </button>
      )}
    </section>
  );
}

function ProvidersBlock() {
  const { server } = useServer();
  return (
    <section id="providers" className="settings-block">
      <div className="section-heading">
        <div>
          <h2>Providers</h2>
          <p>Keys and logins the worker uses when an Agent has no provider of its own.</p>
        </div>
      </div>
      {server ? (
        <>
          <ProviderCards />
          <details className="provider-advanced">
            <summary>Advanced worker environment</summary>
            <EnvironmentManager scope="server" />
          </details>
        </>
      ) : (
        <p className="muted">Pair this machine first. Provider keys are encrypted for it.</p>
      )}
    </section>
  );
}

function AppearanceBlock() {
  const { theme, setTheme } = useTheme();
  return (
    <section id="appearance" className="settings-block">
      <div className="section-heading">
        <div>
          <h2>Appearance</h2>
          <p>Choose the color mode that is easiest on your eyes.</p>
        </div>
      </div>
      <div className="settings-option">
        <div>
          <strong>Color mode</strong>
          <span>{theme === "dark" ? "Dark mode is active" : "Light mode is active"}</span>
        </div>
        <div className="theme-toggle" aria-label="Color mode">
          <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")} type="button">
            Dark
          </button>
          <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")} type="button">
            Light
          </button>
        </div>
      </div>
    </section>
  );
}
