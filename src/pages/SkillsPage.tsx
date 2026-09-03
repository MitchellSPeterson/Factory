import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";

export function SkillsPage() {
  const skills = useQuery(api.skills.list);
  return (
    <>
      <div className="pagehead">
        <h1>Skills</h1>
      </div>
      <p className="muted">
        Factory-owned copies. Edit a body here. Stage bindings live on the
        Feature recipe.
      </p>
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
