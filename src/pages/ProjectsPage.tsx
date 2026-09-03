import { useMutation, useQuery } from "convex/react";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";

export function ProjectsPage() {
  const projects = useQuery(api.projects.list);
  const create = useMutation(api.projects.create);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"expo" | "web" | "mixed">("mixed");
  const [localPath, setLocalPath] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [runtime, setRuntime] = useState<"local" | "cloud">("local");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await create({
      name,
      kind,
      localPath,
      githubRepo,
      defaultRuntime: runtime,
    });
    setName("");
    setLocalPath("");
    setGithubRepo("");
  }

  return (
    <>
      <div className="pagehead">
        <h1>Projects</h1>
      </div>
      <div className="box list">
        {projects?.map((p) => (
          <Link className="card" key={p._id} to={`/projects/${p._id}`}>
            <strong>{p.name}</strong>
            <div className="muted">
              {p.kind} · {p.defaultRuntime} · {p.localPath}
            </div>
          </Link>
        ))}
      </div>
      <h2>Register a repo</h2>
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
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
          />
        </label>
        <label>
          GitHub repo (owner/name)
          <input
            value={githubRepo}
            onChange={(e) => setGithubRepo(e.target.value)}
          />
        </label>
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
        <button type="submit">Add project</button>
      </form>
    </>
  );
}
