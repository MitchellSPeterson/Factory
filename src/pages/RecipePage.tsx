import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  AGENT_EFFORTS,
  AGENT_MODELS,
} from "../../convex/lib/agentModel";

export function RecipePage() {
  const recipe = useQuery(api.recipes.getFeature);
  const skills = useQuery(api.skills.list);
  const setAgent = useMutation(api.recipes.setAgent);
  const setGate = useMutation(api.recipes.setBindingGate);
  const addBinding = useMutation(api.recipes.addBinding);
  const removeBinding = useMutation(api.recipes.removeBinding);

  if (recipe === undefined) return <p className="muted">Loading…</p>;
  if (recipe === null) {
    return (
      <p className="muted">
        Feature recipe is not seeded. Start the worker once.
      </p>
    );
  }

  return (
    <>
      <div className="pagehead">
        <h1>{recipe.name} recipe</h1>
      </div>
      <p className="muted">
        Bindings decide which skills a stage sees. The grilling binding uses the
        largeAndThinSpec gate.
      </p>
      <section className="card recipe-agent">
        <label>
          Model
          <select
            value={recipe.model}
            onChange={(e) =>
              void setAgent({
                recipeId: recipe._id,
                model: e.target.value,
              })
            }
          >
            {AGENT_MODELS.includes(
              recipe.model as (typeof AGENT_MODELS)[number],
            ) ? null : (
              <option value={recipe.model}>{recipe.model}</option>
            )}
            {AGENT_MODELS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Effort
          <select
            value={recipe.effort}
            onChange={(e) =>
              void setAgent({
                recipeId: recipe._id,
                effort: e.target.value as (typeof AGENT_EFFORTS)[number],
              })
            }
          >
            {AGENT_EFFORTS.map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </label>
      </section>
      {recipe.stages.map((stage) => (
        <section key={stage._id} className="card stack" style={{ marginBottom: "1rem" }}>
          <h2 style={{ margin: 0 }}>
            {stage.order + 1}. {stage.title}{" "}
            <span className="mono muted">{stage.key}</span>
          </h2>
          {stage.bindings.map((b) => (
            <div className="binding" key={b._id}>
              <span className="binding-skill">
                <Link to={`/skills/${b.skillId}`}>{b.title}</Link>
                <span className="mono muted">{b.slug}</span>
              </span>
              <label>
                Gate
                <select
                  value={b.gate ?? ""}
                  onChange={(e) => {
                    const value = e.target.value;
                    void setGate({
                      bindingId: b._id,
                      gate:
                        value === "largeAndThinSpec"
                          ? "largeAndThinSpec"
                          : undefined,
                    });
                  }}
                >
                  <option value="">always</option>
                  <option value="largeAndThinSpec">largeAndThinSpec</option>
                </select>
              </label>
              <button
                type="button"
                className="ghost"
                onClick={() => void removeBinding({ bindingId: b._id })}
              >
                Remove
              </button>
            </div>
          ))}
          <AddSkill
            skills={skills ?? []}
            onAdd={(skillId) => addBinding({ stageId: stage._id, skillId })}
          />
        </section>
      ))}
    </>
  );
}

function AddSkill({
  skills,
  onAdd,
}: {
  skills: Array<{ _id: Id<"skills">; title: string; slug: string }>;
  onAdd: (skillId: Id<"skills">) => Promise<unknown>;
}) {
  const first = skills[0];
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const skillId = data.get("skillId");
        if (typeof skillId === "string" && skillId !== "") {
          void onAdd(skillId as Id<"skills">);
        }
      }}
    >
      <select name="skillId" defaultValue={first?._id ?? ""}>
        {skills.map((s) => (
          <option key={s._id} value={s._id}>
            {s.title}
          </option>
        ))}
      </select>
      <button type="submit" className="ghost">
        Add skill
      </button>
    </form>
  );
}
