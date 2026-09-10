import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { sealSecret } from "../../shared/secrets";
import { serverVariableNames, validateVariableName } from "../../shared/managed";
import { useServer } from "./connection";

export function WorkerSettings() {
  const { server, accessKey, pair, unpair } = useServer();
  const live = useQuery(api.servers.paired, server ? { accessKey } : "skip");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  return <section className="settings-section"><div className="section-heading"><div><h2>Worker</h2><p>This machine clones repositories and runs your Jobs.</p></div></div>
    {server ? <><div className="settings-option"><div><strong>{server.name} · {live && now - live.lastSeen < 45000 ? "Online" : "Offline"}</strong><span>Repositories: {server.projectsRoot}</span></div><button className="ghost" onClick={unpair}>Lock settings</button></div><ProviderCards /><details className="provider-advanced"><summary>Advanced worker environment</summary><EnvironmentManager scope="server" /></details></> : <form className="stack" onSubmit={async event => { event.preventDefault(); setBusy(true); setError(""); try { await pair(key); setKey(""); } catch { setError("Unable to pair. Check the worker key and make sure the worker has started."); } finally { setBusy(false); } }}><p className="muted">Start the worker, then run <code>bun run worker:pair</code> and paste the key here. Pairing lasts for this browser session.</p><label>Worker pairing key<input type="password" autoComplete="off" value={key} onChange={event => setKey(event.target.value)} /></label><button disabled={busy || !key.trim()}>{busy ? "Pairing…" : "Pair worker"}</button>{error && <p role="alert" className="error">{error}</p>}</form>}
  </section>;
}

type ProviderCardProps = { name: string; description: string; variable?: typeof serverVariableNames[number]; placeholder?: string; children?: ReactNode };

function ProviderCards() {
  return <div className="provider-grid" aria-label="Agent providers">
    <ProviderCard name="Cursor" description="Use Cursor Agents with your Cursor API key." variable="CURSOR_API_KEY" placeholder="Cursor API key" />
    <ProviderCard name="Codex" description="Use the Codex CLI login on this machine, or save an API key." variable="CODEX_API_KEY" placeholder="Codex API key (optional)"><p className="muted">Subscription: run <code>codex login</code> once.</p></ProviderCard>
    <ProviderCard name="Grok Build" description="Use your Grok, SuperGrok, or X Premium subscription—no API key required." variable="XAI_API_KEY" placeholder="xAI API key (optional)"><p className="muted">Subscription: install with <code>npm install -g @xai-official/grok</code>, then run <code>grok login</code>.</p></ProviderCard>
  </div>;
}

function ProviderCard({ name, description, variable, placeholder, children }: ProviderCardProps) {
  const { server, accessKey } = useServer();
  const variables = useQuery(api.servers.variables, server ? { accessKey, scope: "server" } : "skip");
  const save = useMutation(api.servers.setVariable);
  const remove = useMutation(api.servers.removeVariable);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const configured = variable ? variables?.some(item => item.name === variable) : false;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!server || !variable || !value) return;
    setBusy(true); setMessage("");
    try {
      await save({ accessKey, scope: "server", name: variable, sealed: await sealSecret(server.publicKey, value) });
      setValue(""); setMessage("Saved for new Runs.");
    } catch { setMessage("Could not save this credential."); }
    finally { setBusy(false); }
  }
  return <article className="provider-card"><div className="provider-card-heading"><div><h3>{name}</h3><p>{description}</p></div><span className={`provider-status ${configured ? "configured" : ""}`}>{configured ? "Key saved" : name === "Cursor" ? "Setup required" : "CLI login supported"}</span></div>{children}<form className="provider-form" onSubmit={submit}><input type="password" autoComplete="off" aria-label={placeholder} placeholder={configured ? `${placeholder} (replace)` : placeholder} value={value} onChange={event => setValue(event.target.value)} /><button disabled={busy || !value}>{busy ? "Saving…" : configured ? "Replace key" : "Save key"}</button>{configured && <button type="button" className="ghost" disabled={busy} onClick={async () => { setBusy(true); try { await remove({ accessKey, scope: "server", name: variable! }); setMessage("Saved key removed."); } finally { setBusy(false); } }}>Remove</button>}</form>{message && <p className="muted" role="status">{message}</p>}</article>;
}
export function EnvironmentManager({ scope }: { scope: string }) {
  const { server, accessKey } = useServer();
  const variables = useQuery(api.servers.variables, server ? { accessKey, scope } : "skip");
  const save = useMutation(api.servers.setVariable);
  const remove = useMutation(api.servers.removeVariable);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!server) return <p className="muted">Pair this machine in Settings to manage environment variables.</p>;
  async function submit() {
    if (!server) return;
    setBusy(true); setError(""); setMessage("");
    try {
      validateVariableName(name, scope === "server");
      if (name === "FACTORY_PROVIDER" && !["cursor", "openai", "codex", "grok"].includes(value)) throw new Error("FACTORY_PROVIDER must be cursor, codex, grok, or openai.");
      await save({ accessKey, scope, name, sealed: await sealSecret(server.publicKey, value) });
      setName(""); setValue(""); setMessage("Saved. Applies to new Runs; active Runs keep their current environment.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save variable."); } finally { setBusy(false); }
  }
  return <div className="environment-manager"><h3>{scope === "server" ? "Worker environment" : "Project environment"}</h3><p className="muted">Values are encrypted for this machine and hidden after saving. No Project .env file is written.</p>
    {scope === "server" && <p className="muted">Choose cursor, codex, grok, or openai for FACTORY_PROVIDER. An Agent’s provider overrides this default. Saved settings override the worker’s startup environment.</p>}
    <div className="settings-project-list">{variables?.map(variable => <div className="settings-project" key={variable.name}><div><strong>{variable.name}</strong><span>••••••••</span></div><div className="row"><button className="ghost" disabled={busy} onClick={() => { setName(variable.name); setValue(""); }}>Replace</button><button className="danger-button" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await remove({ accessKey, scope, name: variable.name }); setMessage("Removed for new Runs. A startup value, if present, will apply again."); } catch { setError("Could not remove variable."); } finally { setBusy(false); } }}>Remove</button></div></div>)}</div>
    <form className="project-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label>Name{scope === "server" ? <select value={name} onChange={event => setName(event.target.value)}><option value="">Choose a setting…</option>{serverVariableNames.map(item => <option key={item}>{item}</option>)}</select> : <input value={name} onChange={event => setName(event.target.value)} placeholder="DATABASE_URL" required />}</label>
      <label>New value<textarea value={value} onChange={event => setValue(event.target.value)} autoComplete="off" placeholder="Enter a value (multiline supported)" /></label>
      <button disabled={busy || !name} type="submit">{busy ? "Saving…" : "Save variable"}</button>
    </form>{message && <p role="status" className="muted">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
  </div>;
}
