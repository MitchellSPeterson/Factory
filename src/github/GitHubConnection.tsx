import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { useGitHub } from "./connection";

export function GitHubConnection() {
  const { connection, connect, disconnect } = useGitHub();
  const begin = useAction(api.github.begin);
  const poll = useAction(api.github.poll);
  const [token, setToken] = useState("");
  const [clientId, setClientId] = useState(() => localStorage.getItem("factory-github-client-id") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [device, setDevice] = useState<{ deviceCode: string; userCode: string; expiresAt: number; interval: number; clientId: string } | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let interval = device.interval;
    async function check() {
      if (Date.now() >= device!.expiresAt) { setError("The code expired. Start sign-in again."); setDevice(null); return; }
      try {
        const result = await poll({ clientId: device!.clientId, deviceCode: device!.deviceCode });
        if (cancelled) return;
        if (result.status === "connected" && result.token) {
          await connect(result.token, controller.signal);
          if (!cancelled) setDevice(null);
          return;
        }
        if (result.status === "slow_down") interval += 5;
        timer = setTimeout(() => void check(), interval * 1000);
      } catch (err) {
        if (!cancelled) { setError(err instanceof Error ? err.message : "GitHub sign-in failed."); setDevice(null); }
      }
    }
    timer = setTimeout(() => void check(), interval * 1000);
    return () => { cancelled = true; controller.abort(); clearTimeout(timer); };
  }, [device, poll, connect]);
  async function tokenConnect() {
    setError(""); setBusy(true);
    try { await connect(token); setToken(""); } catch (err) { setError(err instanceof Error ? err.message : "Connection failed."); } finally { setBusy(false); }
  }
  async function appConnect() {
    setError(""); setBusy(true);
    const current = generation.current;
    try {
      const result = await begin({ clientId: clientId.trim() });
      if (generation.current !== current) return;
      localStorage.setItem("factory-github-client-id", clientId.trim());
      setDevice({ ...result, clientId: clientId.trim(), interval: Math.max(5, result.interval), expiresAt: Date.now() + result.expiresIn * 1000 });
    } catch (err) { setError(err instanceof Error ? err.message : "Sign-in failed."); } finally { setBusy(false); }
  }
  return <section className="settings-section github-connection">
    <div className="section-heading"><div><h2>GitHub connection</h2><p>Connect GitHub to import repositories into VASA.</p></div>{connection && <span className="github-badge">Connected</span>}</div>
    {connection ? <div className="settings-option"><div><strong>@{connection.login}</strong><span>Connected for this browser session. Reloading requires reconnecting.</span></div><button type="button" className="ghost" onClick={disconnect}>Disconnect</button></div> : <>
      <form className="stack" onSubmit={event => { event.preventDefault(); void tokenConnect(); }}>
        <p className="muted">Create a fine-grained token for the repositories you want to import, with read access to Contents. Metadata access is included.</p>
        <a className="text-button" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Create a GitHub token ↗</a>
        <label>Personal access token<input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} placeholder="github_pat_…" disabled={!!device || busy} /></label>
        <p className="muted">Your token stays in memory and is sent directly to GitHub. It is not saved in Factory.</p>
        <button disabled={!token.trim() || busy || !!device} type="submit">{busy ? "Connecting…" : "Connect GitHub"}</button>
      </form>
      <details className="github-app-setup"><summary>Connect with a GitHub App</summary><div className="stack">
        <p>Register a GitHub App, enable Device Flow, and grant read access to Contents. Install it on the repositories you want VASA to access, then enter its public client ID.</p>
        <a className="text-button" href="https://github.com/settings/apps/new" target="_blank" rel="noreferrer">Register a GitHub App ↗</a>
        <label>GitHub App client ID<input value={clientId} onChange={event => setClientId(event.target.value)} placeholder="Iv…" disabled={!!device || busy} /></label>
        {device ? <div className="github-device" role="status"><p>Enter this code on GitHub:</p><strong>{device.userCode}</strong><a className="button" href="https://github.com/login/device" target="_blank" rel="noreferrer">Open GitHub ↗</a><p>Waiting for authorization…</p><button className="ghost" onClick={() => setDevice(null)}>Cancel</button></div> : <button type="button" disabled={!clientId.trim() || busy} onClick={() => void appConnect()}>Sign in with GitHub App</button>}
      </div></details>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
