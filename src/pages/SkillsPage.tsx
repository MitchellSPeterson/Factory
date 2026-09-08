import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";

export function SkillsPage() {
  const skills = useQuery(api.skills.list);
  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Skills</h1>
          <p className="muted">
            {skills === undefined
              ? "Factory-owned copies. Stage bindings live on a Workflow."
              : `${skills.length} skills · Factory-owned copies. Stage bindings live on a Workflow`}
          </p>
        </div>
      </div>
      <div className="box list">
        {skills?.map((s) => (
          <Link className="card" key={s._id} to={`/skills/${s._id}`}>
            <strong>{s.title}</strong>
            <div className="muted mono">{s.slug}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
