import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { github, type Repository } from "./api";
import { useGitHub } from "./connection";

export function RepositoryField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { connection } = useGitHub();
  const [repos, setRepos] = useState<Repository[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setRepos([]); setPage(1); }, [connection]);
  useEffect(() => {
    if (!connection) return;
    const controller = new AbortController();
    setBusy(true); setError("");
    void github<Repository[]>(connection.token, `/user/repos?sort=updated&per_page=100&page=${page}`, controller.signal).then(rows => {
      if (controller.signal.aborted) return;
      setRepos(old => page === 1 ? rows : [...old, ...rows.filter(row => !old.some(item => item.id === row.id))]); setMore(rows.length === 100);
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [connection, page]);
  return <div className="stack github-repo-field"><label>GitHub repository<input value={value} onChange={event => onChange(event.target.value)} placeholder="owner/repo" /></label>
    {connection ? <><label>Choose from GitHub<select value="" disabled={busy} onChange={event => onChange(event.target.value)}><option value="">{busy ? "Loading repositories…" : "Select a repository…"}</option>{repos.map(repo => <option key={repo.id} value={repo.full_name}>{repo.full_name}{repo.private ? " · private" : ""}</option>)}</select></label>{more && <button className="ghost" type="button" disabled={busy} onClick={() => setPage(page + 1)}>Load more repositories</button>}{error && <p role="alert" className="error">{error}</p>}</> : <Link className="text-button" to="/settings?tab=github">Connect GitHub to choose a repository</Link>}
  </div>;
}
