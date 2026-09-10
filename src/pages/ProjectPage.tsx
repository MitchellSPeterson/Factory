import { EnvironmentManager } from "../servers/WorkerSettings";
import { useServer } from "../servers/connection";
import { RetryClone } from "../servers/AddGitHubProject";
import { useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

import { RepositoryField } from "../github/RepositoryField";

function asRecipeId(value: string): Id<"recipes"> | undefined {
  return value === "" ? undefined : (value as Id<"recipes">);
}

export function ProjectPage() {
  const { server, accessKey } = useServer();
  const { projectId } = useParams<{ projectId: string }>();
  const id = projectId as Id<"projects">;
  const project = useQuery(api.projects.get, { projectId: id });
  const recipes = useQuery(api.recipes.list);
  const update = useMutation(api.projects.update);
  const remove = useMutation(api.projects.remove);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expo" | "web" | "mixed">("mixed");
  const [localPath, setLocalPath] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [runtime, setRuntime] = useState<"local" | "cloud">("local");
  const [recipeId, setRecipeId] = useState("");

  useEffect(() => {
    if (!project) return;
    setName(project.name);
    setKind(project.kind);
    setLocalPath(project.localPath);
    setGithubRepo(project.githubRepo);
    setRuntime(project.defaultRuntime);
    setRecipeId(project.recipeId ?? "");
  }, [project]);

  if (project === undefined) return <p className="muted">Loading…</p>;
  if (project === null) return <p>Project not found.</p>;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await update({
      projectId: id,
      accessKey: accessKey || undefined,
      name,
      kind,
      localPath,
      githubRepo,
      defaultRuntime: runtime,
      recipeId: asRecipeId(recipeId),
    });
  }

  return (
    <>
      <p className="crumb">
        <Link to="/projects">Projects</Link>
      </p>
      <div className="pagehead">
        <h1>{project.name}</h1>
      </div>
      {project.serverId && <section className="settings-section"><h2>Repository · {project.cloneStatus}</h2><p className="muted">{project.localPath || "Waiting for the worker to clone this repository."}</p>{project.cloneError && <p className="error">{project.cloneError}</p>}{project.cloneStatus === "failed" && <RetryClone projectId={id} />}</section>}
      <form className="stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            <option value="expo">expo</option>
            <option value="web">web</option>
            <option value="mixed">mixed</option>
          </select>
        </label>
        <label>
          Local path
          <input
            disabled={!!project.serverId}
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
          />
        </label>
        {project.serverId ? <p>GitHub repository: {githubRepo}</p> : <RepositoryField value={githubRepo} onChange={setGithubRepo} />}
        <label>
          Default runtime
          <select
            value={runtime}
            onChange={(e) => setRuntime(e.target.value as typeof runtime)}
          >
            <option value="local">local</option>
            <option value="cloud">cloud</option>
          </select>
        </label>
        <label>
          Workflow
          <select
            value={recipeId}
            onChange={(e) => setRecipeId(e.target.value)}
          >
            <option value="">Feature (default)</option>
            {recipes?.map((recipe) => (
              <option key={recipe._id} value={recipe._id}>
                {recipe.name}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <button type="submit">Save</button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              void remove({ projectId: id, accessKey: accessKey || undefined }).then(() => navigate("/projects"));
            }}
          >
            Remove
          </button>
        </div>
      </form>
      {project.serverId && <section className="settings-section">{server?.id === project.serverId ? <EnvironmentManager key={id} scope={id} /> : <p className="muted">Pair this machine in Settings to manage its environment.</p>}</section>}
    </>
  );
}
