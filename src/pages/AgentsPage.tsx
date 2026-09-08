import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { AGENT_MODELS, AGENT_EFFORTS, DEFAULT_AGENT_MODEL } from "../../convex/lib/agentModel";

type Draft = Pick<Doc<"agents">, "name" | "description" | "model" | "effort" | "guidance" | "skillIds"> & { agentId?: Id<"agents"> };
const blank = (): Draft => ({ name: "", description: "", model: DEFAULT_AGENT_MODEL, effort: "medium", guidance: "", skillIds: [] });
export function AgentsPage() {
  const agents = useQuery(api.agents.list);
  const skills = useQuery(api.skills.list);
  const save = useMutation(api.agents.save);
  const remove = useMutation(api.agents.remove);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");
  const [skillSearch, setSkillSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const editorOpen = draft !== null;
  useEffect(() => { if (editorOpen) dialog.current?.showModal(); }, [editorOpen]);
  function edit(value: Draft) { setDraft(value); setError(""); setSaved(""); setSkillSearch(""); }
  async function persist() {
    if (!draft) return;
    setBusy(true); setError("");
    try { await save(draft); setDraft(null); setSaved("Agent saved. Changes apply to future Runs."); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const visible = agents?.filter(a => `${a.name} ${a.description} ${a.model}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <div className="pagehead"><div><h1>Agents</h1><p className="muted">Specialists for every Stage of your Workflow.</p></div><button onClick={() => edit(blank())}>+ New Agent</button></div>
    <p className="muted">Choose how an Agent works, then assign it to one or more Stages in <Link to="/workflows">Workflows</Link>.</p>
    {saved && <p role="status">{saved}</p>}
    {!draft && error && <p role="alert">{error}</p>}
    <input className="agents-search" aria-label="Search Agents" placeholder="Search Agents…" value={search} onChange={e => setSearch(e.target.value)} />
    {agents === undefined ? <p className="muted">Loading Agents…</p> : !agents.length ? <section className="card agents-empty"><div className="agent-avatar">A</div><h2>Build your first specialist</h2><p className="muted">Create a planner, builder, or reviewer with the model and Skills its work needs.</p><button onClick={() => edit(blank())}>Create Agent</button></section> : !visible?.length ? <p className="muted">No Agents match your search.</p> : <div className="agents-grid">{visible.map(a => <article className="card agent-card" key={a._id}>
      <div className="row"><div className="agent-avatar">{a.name.slice(0, 2).toUpperCase()}</div><h2>{a.name}</h2></div><p className="muted agent-description">{a.description || "No description yet."}</p>
      <div className="row"><span className="badge">{a.model}</span><span className="badge">{a.effort} effort</span></div><p className="muted">{a.skillIds.length} Skills</p>
      <div className="row"><button className="ghost" onClick={() => edit({ agentId: a._id, name: a.name, description: a.description, model: a.model, effort: a.effort, guidance: a.guidance, skillIds: a.skillIds })}>Edit Agent</button><button className="ghost" onClick={() => edit({ name: `${a.name} copy`, description: a.description, model: a.model, effort: a.effort, guidance: a.guidance, skillIds: a.skillIds })}>Duplicate</button></div>
    </article>)}</div>}
    {draft && <dialog ref={dialog} className="agent-dialog" aria-labelledby="agent-editor-title" onCancel={e => { e.preventDefault(); if (!busy) setDraft(null); }}><section className="card agent-editor"><form className="stack" onSubmit={e => { e.preventDefault(); void persist(); }}>
      <div className="pagehead"><h2 id="agent-editor-title">{draft.agentId ? "Edit Agent" : "New Agent"}</h2><button type="button" className="ghost" disabled={busy} onClick={() => setDraft(null)}>Cancel</button></div>
      {error && <p role="alert">{error}</p>}
      <label>Name<input autoFocus required maxLength={100} placeholder="e.g. Code reviewer" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Description<textarea maxLength={2000} placeholder="What does this Agent specialize in?" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
      <div className="agent-settings"><label>Model<input required list="agent-models" value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })} /><datalist id="agent-models">{AGENT_MODELS.map(m => <option key={m} value={m} />)}</datalist></label><label>Effort<select value={draft.effort} onChange={e => setDraft({ ...draft, effort: e.target.value as Draft["effort"] })}>{AGENT_EFFORTS.map(e => <option key={e} value={e}>{e}</option>)}</select></label></div>
      <p className="muted">Choose a configured model or enter a model ID supported by your worker.</p>
      <label>Working guidance<textarea rows={5} maxLength={20000} placeholder="Focus, constraints, and what a good handoff should include…" value={draft.guidance} onChange={e => setDraft({ ...draft, guidance: e.target.value })} /></label>
      <fieldset className="agent-skills"><legend>Skills · {draft.skillIds.length} selected</legend><p className="muted">Selected Skills are included on every Run using this Agent. Stage Bindings add Skills and Gates.</p><input aria-label="Search Skills" placeholder="Search Skills…" value={skillSearch} onChange={e => setSkillSearch(e.target.value)} /><div className="agent-skill-list">{skills === undefined ? <p>Loading Skills…</p> : skills.length === 0 ? <p className="muted">Add Skills from the Skills page first.</p> : skills.filter(s => `${s.title} ${s.slug}`.toLowerCase().includes(skillSearch.toLowerCase())).map(s => <label className="agent-skill-option" key={s._id}><input type="checkbox" checked={draft.skillIds.includes(s._id)} onChange={e => setDraft({ ...draft, skillIds: e.target.checked ? [...draft.skillIds, s._id] : draft.skillIds.filter(id => id !== s._id) })} /><span>{s.title}<small className="muted">{s.description || s.slug}</small></span></label>)}</div></fieldset>
      <div className="pagehead"><button type="submit" disabled={busy || !draft.name.trim() || !draft.model.trim()}>{busy ? "Saving…" : "Save Agent"}</button>{draft.agentId && <button type="button" className="ghost" disabled={busy} onClick={async () => { if (!window.confirm(`Delete ${draft.name}?`)) return; setBusy(true); setError(""); try { await remove({ agentId: draft.agentId! }); setDraft(null); } catch(e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } }}>Delete Agent</button>}</div>
    </form></section></dialog>}
  </>;
}
