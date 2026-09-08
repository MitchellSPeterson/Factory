import { useMutation, useQuery } from "convex/react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  AGENT_EFFORTS,
  AGENT_MODELS,
} from "../../convex/lib/agentModel";

export function RecipePage() {
  const { recipeId } = useParams<{ recipeId: string }>();
  const id = recipeId as Id<"recipes">;
  const recipe = useQuery(api.recipes.get, { recipeId: id });
  const skills = useQuery(api.skills.list);
  const agents = useQuery(api.agents.list);
  const setAgent = useMutation(api.recipes.setAgent);
  const updateRecipe = useMutation(api.recipes.update);
  const removeRecipe = useMutation(api.recipes.remove);
  const addStage = useMutation(api.recipes.addStage);
  const updateStage = useMutation(api.recipes.updateStage);
  const removeStage = useMutation(api.recipes.removeStage);
  const moveStage = useMutation(api.recipes.moveStage);
  const setGate = useMutation(api.recipes.setBindingGate);
  const addBinding = useMutation(api.recipes.addBinding);
  const removeBinding = useMutation(api.recipes.removeBinding);
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<Id<"stages"> | "">("");
  const [name, setName] = useState("");
  const [requestTemplate, setRequestTemplate] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!recipe) return;
    setName(recipe.name);
    setRequestTemplate(recipe.requestTemplate ?? "");
    if (selectedId === "" && recipe.stages[0]) {
      setSelectedId(recipe.stages[0]._id);
      return;
    }
    if (
      selectedId !== "" &&
      !recipe.stages.some((s) => s._id === selectedId)
    ) {
      setSelectedId(recipe.stages[0]?._id ?? "");
    }
  }, [recipe, selectedId]);

  if (recipe === undefined) return <p className="muted">Loading…</p>;
  if (recipe === null) return <p>Workflow not found.</p>;

  const selected = recipe.stages.find((s) => s._id === selectedId) ?? null;

  async function run(fn: () => Promise<unknown>) {
    setError("");
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onAdd(beforeStageId?: Id<"stages">) {
    const stageId = await addStage({
      recipeId: id,
      title: "Stage",
      beforeStageId,
    });
    setSelectedId(stageId);
  }

  return (
    <>
      <p className="crumb">
        <Link to="/workflows">Workflows</Link> / {recipe.slug}
      </p>
      <div className="pagehead">
        <h1>{recipe.name} workflow</h1>
        <button
          type="button"
          className="ghost"
          onClick={() =>
            void run(async () => {
              if (!window.confirm("Delete this Workflow?")) return;
              await removeRecipe({ recipeId: id });
              navigate("/workflows");
            })
          }
        >
          Delete
        </button>
      </div>
      <p className="muted">
        Click a Stage to edit it. Plus adds a Stage. Drag to reorder.
      </p>
      {error ? <p className="muted">{error}</p> : null}
      <section className="card recipe-agent">
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name.trim() !== "" && name !== recipe.name) {
                void run(() => updateRecipe({ recipeId: id, name }));
              }
            }}
          />
        </label>
        <label>
          Default model
          <select
            value={recipe.model}
            onChange={(e) =>
              void run(() =>
                setAgent({ recipeId: id, model: e.target.value }),
              )
            }
          >
            {AGENT_MODELS.includes(
              recipe.model as (typeof AGENT_MODELS)[number],
            ) ? null : (
              <option value={recipe.model}>{recipe.model}</option>
            )}
            {AGENT_MODELS.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <label>
          Default effort
          <select
            value={recipe.effort}
            onChange={(e) =>
              void run(() =>
                setAgent({
                  recipeId: id,
                  effort: e.target.value as (typeof AGENT_EFFORTS)[number],
                }),
              )
            }
          >
            {AGENT_EFFORTS.map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </label>
        <label className="workflow-template">
          Request template
          <textarea
            value={requestTemplate}
            onChange={(e) => setRequestTemplate(e.target.value)}
            onBlur={() => {
              if (requestTemplate !== (recipe.requestTemplate ?? "")) {
                void run(() => updateRecipe({ recipeId: id, requestTemplate }));
              }
            }}
            placeholder="Describe the context, outcome, and acceptance criteria this Workflow expects."
          />
          <span className="muted">Shown first when someone selects this Workflow for a new Job.</span>
        </label>
      </section>
      <RecipeGraph
        stages={recipe.stages}
        selectedId={selected?._id ?? ""}
        onSelect={setSelectedId}
        onAdd={(before) => void run(() => onAdd(before))}
        onMove={(stageId, toOrder) =>
          void run(() => moveStage({ stageId, toOrder }))
        }
      />
      {selected ? (
        <StageEditor
          agents={agents ?? []}
          recipe={recipe}
          stage={selected}
          skills={skills ?? []}
          onUpdate={(patch) =>
            void run(() => updateStage({ stageId: selected._id, ...patch }))
          }
          onMove={(toOrder) =>
            void run(() => moveStage({ stageId: selected._id, toOrder }))
          }
          onRemove={() =>
            void run(() => removeStage({ stageId: selected._id }))
          }
          onAddSkill={(skillId) =>
            addBinding({ stageId: selected._id, skillId })
          }
          onGate={(bindingId, gate) => setGate({ bindingId, gate })}
          onRemoveSkill={(bindingId) => removeBinding({ bindingId })}
        />
      ) : (
        <p className="muted">Add a Stage to start editing this Workflow.</p>
      )}
    </>
  );
}

function RecipeGraph({
  stages,
  selectedId,
  onSelect,
  onAdd,
  onMove,
}: {
  stages: Array<{
    _id: Id<"stages">;
    key: string;
    title: string;
    halt: boolean;
    bindings: unknown[];
    model?: string;
    effort?: string;
  }>;
  selectedId: Id<"stages"> | "";
  onSelect: (id: Id<"stages">) => void;
  onAdd: (beforeStageId?: Id<"stages">) => void;
  onMove: (stageId: Id<"stages">, toOrder: number) => void;
}) {
  return (
    <div className="recipe-graph" role="list">
      {stages.map((stage, index) => (
        <div key={stage._id} className="recipe-graph-item">
          <button
            type="button"
            className="recipe-add"
            aria-label={`Add stage before ${stage.title}`}
            onClick={() => onAdd(stage._id)}
          >
            +
          </button>
          <button
            type="button"
            className={
              stage._id === selectedId
                ? "recipe-node selected"
                : "recipe-node"
            }
            role="listitem"
            aria-pressed={stage._id === selectedId}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("text/stage-id", stage._id);
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={(e) => {
              e.preventDefault();
              const from = e.dataTransfer.getData("text/stage-id");
              if (from !== "") onMove(from as Id<"stages">, index);
            }}
            onClick={() => onSelect(stage._id)}
          >
            <strong>{stage.title}</strong>
            <span className="mono muted">{stage.key}</span>
            <span className="muted">
              {stage.bindings.length}{" "}
              {stage.bindings.length === 1 ? "skill" : "skills"}
              {stage.model || stage.effort
                ? ` · ${stage.model ?? "default"} / ${stage.effort ?? "default"}`
                : ""}
            </span>
            {stage.halt ? <span className="badge wait">halt</span> : null}
          </button>
          <span className="recipe-arrow" aria-hidden="true">
            →
          </span>
        </div>
      ))}
      <button
        type="button"
        className="recipe-add recipe-add-end"
        aria-label="Add stage"
        onClick={() => onAdd()}
      >
        +
      </button>
    </div>
  );
}

function StageEditor({
  agents,
  recipe,
  stage,
  skills,
  onUpdate,
  onMove,
  onRemove,
  onAddSkill,
  onGate,
  onRemoveSkill,
}: {
  agents: Array<{ _id: Id<"agents">; name: string; provider?: string; model: string; effort: string; skillIds: Id<"skills">[] }>;
  recipe: { model: string; effort: string; stages: Array<{ _id: string }> };
  stage: {
    agentProfileId?: Id<"agents">;
    _id: Id<"stages">;
    key: string;
    title: string;
    order: number;
    model?: string;
    effort?: string;
    halt: boolean;
    lane?: "planning" | "building" | "pr";
    bindings: Array<{
      _id: Id<"bindings">;
      skillId: Id<"skills">;
      slug: string;
      title: string;
      gate?: "largeAndThinSpec";
    }>;
  };
  skills: Array<{ _id: Id<"skills">; title: string; slug: string }>;
  onUpdate: (patch: {
    agentProfileId?: Id<"agents"> | null;
    title?: string;
    key?: string;
    model?: string;
    effort?: string;
    halt?: boolean;
    lane?: "planning" | "building" | "pr" | "";
  }) => void;
  onMove: (toOrder: number) => void;
  onRemove: () => void;
  onAddSkill: (skillId: Id<"skills">) => Promise<unknown>;
  onGate: (
    bindingId: Id<"bindings">,
    gate: "largeAndThinSpec" | undefined,
  ) => Promise<unknown>;
  onRemoveSkill: (bindingId: Id<"bindings">) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(stage.title);
  const [key, setKey] = useState(stage.key);

  useEffect(() => {
    setTitle(stage.title);
    setKey(stage.key);
  }, [stage._id, stage.title, stage.key]);

  function onTitleBlur() {
    if (title.trim() !== "" && title !== stage.title) {
      onUpdate({ title });
    }
  }

  function onKeySubmit(e: FormEvent) {
    e.preventDefault();
    if (key.trim() !== "" && key !== stage.key) onUpdate({ key });
  }

  const assigned = agents.find(a => a._id === stage.agentProfileId);
  const defaultLane =
    stage.key === "plan" ? "planning" : stage.key === "pr" ? "pr" : "building";

  return (
    <section className="card stack">
      <h2 style={{ margin: 0 }}>
        {stage.order + 1}. {stage.title}{" "}
        <span className="mono muted">{stage.key}</span>
      </h2>
      <label>Assigned Agent<select value={stage.agentProfileId ?? ""} onChange={e => onUpdate({ agentProfileId: e.target.value ? e.target.value as Id<"agents"> : null })}><option value="">No Agent · Workflow defaults</option>{agents.map(a => <option key={a._id} value={a._id}>{a.name}</option>)}</select></label>
      <p className="muted">{assigned ? `${assigned.name}${assigned.provider ? ` (${assigned.provider})` : ""} provides ${assigned.skillIds.length} Skills, ${assigned.model}, and ${assigned.effort} effort. Stage settings below can override model and effort.` : "Select an Agent or use Workflow defaults."} <Link to="/agents">Manage Agents</Link></p>
      <div className="recipe-agent">
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={onTitleBlur}
          />
        </label>
        <form onSubmit={onKeySubmit}>
          <label>
            Key
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onBlur={() => {
                if (key.trim() !== "" && key !== stage.key) onUpdate({ key });
              }}
            />
          </label>
        </form>
        <label>
          Model
          <select
            value={stage.model ?? ""}
            onChange={(e) => onUpdate({ model: e.target.value })}
          >
            <option value="">{assigned ? "Agent" : "Workflow"} default ({assigned?.model ?? recipe.model})</option>
            {AGENT_MODELS.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <label>
          Effort
          <select
            value={stage.effort ?? ""}
            onChange={(e) => onUpdate({ effort: e.target.value })}
          >
            <option value="">{assigned ? "Agent" : "Workflow"} default ({assigned?.effort ?? recipe.effort})</option>
            {AGENT_EFFORTS.map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </label>
        <label>
          Board lane
          <select
            value={stage.lane ?? ""}
            onChange={(e) =>
              onUpdate({
                lane: e.target.value as "planning" | "building" | "pr" | "",
              })
            }
          >
            <option value="">Auto ({defaultLane})</option>
            <option value="planning">Planning</option>
            <option value="building">Building</option>
            <option value="pr">PR</option>
          </select>
        </label>
      </div>
      <label className="row" style={{ display: "flex" }}>
        <input
          type="checkbox"
          checked={stage.halt}
          onChange={(e) => onUpdate({ halt: e.target.checked })}
          style={{ width: "auto" }}
        />
        Halt for a human before the next Stage
      </label>
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
                void onGate(
                  b._id,
                  value === "largeAndThinSpec"
                    ? "largeAndThinSpec"
                    : undefined,
                );
              }}
            >
              <option value="">always</option>
              <option value="largeAndThinSpec">largeAndThinSpec</option>
            </select>
          </label>
          <button
            type="button"
            className="ghost"
            onClick={() => void onRemoveSkill(b._id)}
          >
            Remove
          </button>
        </div>
      ))}
      <AddSkill skills={skills} onAdd={onAddSkill} />
      <div className="row">
        <button
          type="button"
          className="ghost"
          disabled={stage.order === 0}
          onClick={() => onMove(stage.order - 1)}
        >
          Move left
        </button>
        <button
          type="button"
          className="ghost"
          disabled={stage.order >= recipe.stages.length - 1}
          onClick={() => onMove(stage.order + 1)}
        >
          Move right
        </button>
        <button type="button" className="ghost" onClick={onRemove}>
          Delete stage
        </button>
      </div>
    </section>
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
