import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { sealSecret } from "../../shared/secrets";
import { validateRepository } from "../../shared/managed";
import { useGitHub } from "../github/connection";
import { RepositoryField } from "../github/RepositoryField";
import { useServer } from "./connection";

export function AddGitHubProject() {
  const { connection } = useGitHub();
  const { server, accessKey } = useServer();
  const recipes = useQuery(api.recipes.list);
  const create = useMutation(api.servers.importRepository);
  const [repo, setRepo] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"web" | "expo" | "mixed">("mixed");
  const [recipeId, setRecipeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Id<"projects"> | null>(null);
  const imported = useQuery(api.projects.get, created ? { projectId: created } : "skip");
  return <section className="settings-section"><div className="section-heading"><div><h2>Add from GitHub</h2><p>Choose a repository. Factory clones it on this machine automatically.</p></div></div>
    {!connection ? <Link className="text-button" to="/settings?tab=github">Connect GitHub first →</Link> : !server ? <p className="muted">Pair a worker in Settings to choose where the repository is cloned.</p> : <form className="project-form" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try { validateRepository(repo); const id = await create({ accessKey, repo, name: name.trim() || repo.split("/")[1]!, kind, recipeId: recipeId ? recipeId as Id<"recipes"> : undefined, sealedToken: await sealSecret(server.publicKey, connection.token) }); setCreated(id); setRepo(""); setName(""); }
      catch (err) { setError(err instanceof Error ? err.message : "Could not import repository."); } finally { setBusy(false); }
    }}>
      <RepositoryField value={repo} onChange={setRepo} />
      <label>Project name<input value={name} onChange={event => setName(event.target.value)} placeholder={repo.split("/")[1] || "Repository name"} /></label>
      <label>Kind<select value={kind} onChange={event => setKind(event.target.value as typeof kind)}><option value="mixed">mixed</option><option value="web">web</option><option value="expo">expo</option></select></label>
      <label>Workflow<select value={recipeId} onChange={event => setRecipeId(event.target.value)}><option value="">Feature (default)</option>{recipes?.map(recipe => <option key={recipe._id} value={recipe._id}>{recipe.name}</option>)}</select></label>
      <p className="muted">Clone on this machine. Your GitHub connection needs Contents read permission. Its token is encrypted for this machine and removed from the import after cloning.</p>
      <button disabled={busy || !repo.trim()}>{busy ? "Adding…" : "Add Project and clone"}</button>
    </form>}
    {error && <p className="error" role="alert">{error}</p>}
    {imported && <p role="status"><Link className="text-button" to={`/projects/${imported._id}`}>{imported.name} · {imported.cloneStatus} →</Link>{imported.cloneError && <span className="error"> {imported.cloneError}</span>}</p>}
  </section>;
}
export function RetryClone({ projectId }: { projectId: Id<"projects"> }) {
  const { connection } = useGitHub(); const { server, accessKey } = useServer();
  const retry = useMutation(api.servers.retryImport);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <><button className="ghost" disabled={!connection || !server || busy} onClick={async () => { if (!connection || !server) return; setBusy(true); setError(""); try { await retry({ projectId, accessKey, sealedToken: await sealSecret(server.publicKey, connection.token) }); } catch { setError("Unable to retry. Check the worker pairing and GitHub connection."); } finally { setBusy(false); } }}>Retry clone</button>{(!connection || !server) && <p className="muted">Connect GitHub and pair this machine in Settings to retry.</p>}{error && <p className="error" role="alert">{error}</p>}</>;
}
