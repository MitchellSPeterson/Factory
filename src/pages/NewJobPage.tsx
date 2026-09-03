import { useMutation, useQuery } from "convex/react";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function NewJobPage() {
  const projects = useQuery(api.projects.list);
  const create = useMutation(api.jobs.create);
  const navigate = useNavigate();
  const [projectId, setProjectId] = useState("");
  const [request, setRequest] = useState("");
  const [runtime, setRuntime] = useState<"local" | "cloud">("local");
  const [forceGrill, setForceGrill] = useState(false);

  const selected = projects?.find((p) => p._id === projectId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (projectId === "") return;
    const jobId = await create({
      projectId: projectId as Id<"projects">,
      request,
      runtime,
      forceGrill,
    });
    navigate(`/jobs/${jobId}`);
  }

  return (
    <>
      <div className="pagehead">
        <h1>New job</h1>
      </div>
      <form className="stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Project
          <select
            value={projectId}
            onChange={(e) => {
              const next = e.target.value;
              setProjectId(next);
              const p = projects?.find((x) => x._id === next);
              if (p) setRuntime(p.defaultRuntime);
            }}
          >
            <option value="">Select…</option>
            {projects?.map((p) => (
              <option key={p._id} value={p._id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Request
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="What should the agents do?"
          />
        </label>
        <label>
          Runtime
          <select
            value={runtime}
            onChange={(e) => setRuntime(e.target.value as typeof runtime)}
          >
            <option value="local">local</option>
            <option value="cloud">cloud</option>
          </select>
        </label>
        <label className="row" style={{ display: "flex" }}>
          <input
            type="checkbox"
            checked={forceGrill}
            onChange={(e) => setForceGrill(e.target.checked)}
            style={{ width: "auto" }}
          />
          Force grill on Plan
        </label>
        {selected ? (
          <p className="muted">
            {selected.kind} · {selected.localPath}
          </p>
        ) : null}
        <button type="submit">Start job</button>
      </form>
    </>
  );
}
