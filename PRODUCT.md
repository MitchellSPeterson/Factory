# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

[Inferred from CONTEXT.md and the existing app.] The primary user is a single trusted operator sitting at their own machine. They run Cursor, Codex, and Grok agents across their product repos from this control plane. There is no multi-user login; GitHub connection and worker pairing are shared on this Factory instance.

## Product Purpose

[Inferred from CONTEXT.md.] VASA is a personal Agentic Software Factory. You sit here. Agents do the work. Success is starting a Job against a Project, watching it move through Lanes, answering Asks, and getting a pull request.

## Positioning

[Inferred.] A Factory-owned Workflow of Stages, Agents, Skills, and Bindings that runs on this machine's worker. Neighboring agent IDEs do not own the Job board, Lane model, or the grilling/plan-review loop.

## Operating Context

[Inferred from the app and docs.] Vite + React frontend, Convex backend, a local worker process that clones repositories and runs Jobs. Settings is where the operator connects GitHub, pairs this machine, registers Projects, saves provider credentials, and chooses color mode. Pairing lasts for the browser session. `/github` redirects into Settings.

## Capabilities and Constraints

Confirmed from the running product:

- Settings currently has four tabs: General (color mode), GitHub (connection + clone-from-GitHub), Projects (list + add local Project), Providers (worker pairing, provider keys, advanced environment).
- Projects also exist as their own page (`/projects`) with overlapping add-Project forms.
- Domain language is locked in CONTEXT.md: Project, Workflow, Agent, Stage, Skill, Binding, Gate, Job, View all, Project scope, Lane, Run, Ask, Artifact. Do not invent synonyms.
- GitHub Enterprise is not supported. Cloud Jobs are Cursor-only. Worker pairing is not application-wide auth.
- [Inferred from the request.] This work redesigns Settings to be easier to use. It keeps every current capability. It does not restyle the rest of the Factory.

Undecided: whether Projects should stay duplicated between `/projects` and Settings, or Settings should only connect and `/projects` should own the list.

## Brand Commitments

Confirmed from project rules:

- Brand as VASA with sidebar tagline "Agentic Software Factory".
- Sidebar mark is `/vasa.svg`; tab icon is the V mark.
- Factory UI follows dark Notara-like sidebar chrome.
- System sans (`-apple-system`, Segoe UI, Noto Sans) and a restrained dark palette with a violet accent (`#8b7cf6`).

## Evidence on Hand

- Live Settings implementation: `src/pages/SettingsPage.tsx` and related GitHub/worker components.
- Capture of the current Settings first viewport: `.impeccable/review/settings.png`.
- Operator docs: `docs/github.md`, `docs/worker-settings.md`.
- Domain glossary: `CONTEXT.md`.
- No testimonials, customers, or benchmarks. Do not invent them.

## Product Principles

1. The operator should see whether the Factory can run a Job without hunting through tabs.
2. Setup has an order: GitHub, this machine, then a Project. The UI should make that order obvious.
3. Speak Factory language. Prefer "this machine" and "pair worker" over "providers" when the task is pairing.
4. Appearance is a preference, not the first job of Settings.
5. Keep the VASA chrome. Settings should feel like the rest of the Factory, just clearer.
