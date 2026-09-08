import { useMutation, useQuery } from "convex/react";
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function RecipesPage() {
  const recipes = useQuery(api.recipes.list);
  const create = useMutation(api.recipes.create);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [fromRecipeId, setFromRecipeId] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const recipeId = await create({
        name,
        fromRecipeId:
          fromRecipeId === ""
            ? undefined
            : (fromRecipeId as Id<"recipes">),
      });
      setName("");
      navigate(`/workflows/${recipeId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Workflows</h1>
          <p className="muted">
            {recipes === undefined
              ? "The ordered Stages a Job walks."
              : `${recipes.length} workflows · The ordered Stages a Job walks`}
          </p>
        </div>
      </div>
      <div className="box list">
        {recipes?.map((recipe) => (
          <Link
            className="card"
            key={recipe._id}
            to={`/workflows/${recipe._id}`}
          >
            <strong>{recipe.name}</strong>
            <div className="muted mono">{recipe.slug}</div>
            <div className="recipe-mini">
              {recipe.stages.map((stage, i) => (
                <span key={stage._id} className="recipe-mini-stage">
                  {i > 0 ? <span className="muted">→</span> : null}
                  {stage.title}
                </span>
              ))}
              {recipe.stages.length === 0 ? (
                <span className="muted">No stages yet</span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
      <h2>New workflow</h2>
      <form className="stack" onSubmit={(e) => void onSubmit(e)}>
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bug Fix"
          />
        </label>
        <label>
          Copy from
          <select
            value={fromRecipeId}
            onChange={(e) => setFromRecipeId(e.target.value)}
          >
            <option value="">Blank</option>
            {recipes?.map((recipe) => (
              <option key={recipe._id} value={recipe._id}>
                {recipe.name}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="muted">{error}</p> : null}
        <button type="submit">Create workflow</button>
      </form>
    </>
  );
}
