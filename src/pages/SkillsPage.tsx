import { useMutation, useQuery } from "convex/react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";

type ImportKind = "github" | "local" | "pasted";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function readSkill(body: string, fallback: string) {
  const match = body.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  const frontmatter = match?.[1] ?? "";
  const name = frontmatter.match(/^name:\s*([^\n]+)$/m)?.[1]?.trim();
  const description = frontmatter.match(/^description:\s*([^\n]+)$/m)?.[1]?.trim();
  const heading = (match?.[2] ?? body).match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = heading ?? name?.replace(/-/g, " ") ?? fallback;
  return { slug: slugify(name ?? title), title, description };
}

function githubRawUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "raw.githubusercontent.com") return url;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parsed.hostname === "github.com" && parts[2] === "blob" && parts.length > 4) {
      return `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.slice(3).join("/")}`;
    }
  } catch {
    // Display the URL validation message in the import sheet.
  }
  return null;
}

export function SkillsPage() {
  const skills = useQuery(api.skills.list);
  const create = useMutation(api.skills.create);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [kind, setKind] = useState<ImportKind>("github");
  const [sourceUrl, setSourceUrl] = useState("");
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!importOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImportOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [importOpen]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return skills?.filter((skill) =>
      [skill.title, skill.slug, skill.description, skill.sourceHint].some((value) =>
        value?.toLowerCase().includes(needle),
      ),
    );
  }, [query, skills]);

  function populateSkill(nextBody: string, fallback = "Untitled skill") {
    const parsed = readSkill(nextBody, fallback);
    setBody(nextBody);
    setTitle(parsed.title);
    setSlug(parsed.slug);
    setDescription(parsed.description ?? "");
  }

  async function loadGithub() {
    const rawUrl = githubRawUrl(sourceUrl);
    if (!rawUrl) {
      setError("Use a public GitHub SKILL.md URL.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(rawUrl);
      if (!response.ok) throw new Error("GitHub could not load that file.");
      populateSkill(await response.text());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load the GitHub skill.");
    } finally {
      setBusy(false);
    }
  }

  async function importSkill() {
    if (!slug || !title || !body) {
      setError("Load or paste a SKILL.md, then confirm its details.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const skillId = await create({
        slug,
        title,
        body,
        description: description || undefined,
        sourceKind: kind,
        sourceHint: kind === "github" ? sourceUrl : kind === "local" ? "Local file" : "Pasted into Factory",
        sourceUrl: kind === "github" ? sourceUrl : undefined,
      });
      navigate(`/skills/${skillId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import the skill.");
    } finally {
      setBusy(false);
    }
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void file.text().then((contents) => populateSkill(contents, file.name.replace(/\.md$/i, "")));
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Skills</h1>
          <p className="muted">
            {skills === undefined
              ? "Portable instructions your Workflows can bind to a stage."
              : `${skills.length} skills · imported copies stay stable for every Job`}
          </p>
        </div>
        <button type="button" onClick={() => setImportOpen(true)}>Import skills</button>
      </div>
      <div className="skills-toolbar">
        <input aria-label="Search skills" placeholder="Search skills, sources, or slugs" value={query} onChange={(event) => setQuery(event.target.value)} />
        <span className="muted">Workflow bindings live on a Workflow.</span>
      </div>
      <div className="skills-grid">
        {filtered?.map((skill) => (
          <Link className="skill-card" key={skill._id} to={`/skills/${skill._id}`}>
            <div className="skill-card-top">
              <span className={`source-badge ${skill.sourceKind ?? "factory"}`}>{skill.sourceKind ?? "factory"}</span>
              <span className="mono muted">{skill.slug}</span>
            </div>
            <strong>{skill.title}</strong>
            <p>{skill.description ?? "No description yet. Open the skill to read its instructions."}</p>
            <span className="skill-card-source">{skill.sourceHint}</span>
          </Link>
        ))}
      </div>
      {skills && filtered?.length === 0 && <div className="skills-empty">No skills match “{query}”.</div>}

      {importOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setImportOpen(false)}>
          <section className="import-sheet" role="dialog" aria-modal="true" aria-label="Import skills" onMouseDown={(event) => event.stopPropagation()}>
            <div className="import-head">
              <div><h2>Import a skill</h2><p>Factory stores a stable copy, with its source recorded for later reference.</p></div>
              <button className="icon-button" type="button" aria-label="Close" onClick={() => setImportOpen(false)}>×</button>
            </div>
            <div className="import-tabs">
              {(["github", "local", "pasted"] as ImportKind[]).map((option) => <button key={option} type="button" className={kind === option ? "active" : ""} onClick={() => { setKind(option); setError(""); }}>{option === "github" ? "GitHub" : option === "local" ? "Local file" : "Paste"}</button>)}
            </div>
            {kind === "github" && <div className="stack"><label>Public GitHub SKILL.md URL<input placeholder="https://github.com/org/repo/blob/main/skills/name/SKILL.md" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label><button type="button" className="ghost" onClick={() => void loadGithub()} disabled={busy}>Load from GitHub</button></div>}
            {kind === "local" && <label>SKILL.md file<input type="file" accept=".md,text/markdown" onChange={onFile} /></label>}
            {kind === "pasted" && <label>SKILL.md<textarea value={body} onChange={(event) => populateSkill(event.target.value)} placeholder={"---\nname: release-check\ndescription: Validate a release before shipping.\n---\n# Release check"} /></label>}
            {body && <div className="import-review"><div className="import-review-head"><strong>Review import</strong><span className="muted">Check the identity before adding it to Factory.</span></div><div className="import-fields"><label>Title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Slug<input value={slug} onChange={(event) => setSlug(slugify(event.target.value))} /></label></div><label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What this skill helps an agent do" /></label></div>}
            {error && <p className="import-error">{error}</p>}
            <div className="import-actions"><button className="ghost" type="button" onClick={() => setImportOpen(false)}>Cancel</button><button type="button" onClick={() => void importSkill()} disabled={busy || !body}>Import into Factory</button></div>
          </section>
        </div>
      )}
    </>
  );
}
