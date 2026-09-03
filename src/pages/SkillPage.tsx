import { useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function SkillPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const id = skillId as Id<"skills">;
  const skill = useQuery(api.skills.get, { skillId: id });
  const update = useMutation(api.skills.update);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!skill) return;
    setTitle(skill.title);
    setBody(skill.body);
  }, [skill]);

  if (skill === undefined) return <p className="muted">Loading…</p>;
  if (skill === null) return <p>Skill not found.</p>;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await update({ skillId: id, title, body });
  }

  return (
    <>
      <p className="crumb">
        <Link to="/skills">Skills</Link> / {skill.slug}
      </p>
      <div className="pagehead">
        <h1>{skill.title}</h1>
      </div>
      <p className="muted">Seeded from {skill.sourceHint}. Edits stay here.</p>
      <form className="stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label>
          Body
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ minHeight: "22rem" }}
          />
        </label>
        <button type="submit">Save skill</button>
      </form>
    </>
  );
}
