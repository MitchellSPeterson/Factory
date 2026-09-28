# Factory

A personal app for Sessions in your product repos. You sit here. The Worker does the work on this Mac.

## Language

**Project**:
A single git repository on this Mac that Factory is allowed to work in, including a monorepo that contains Expo and web together.
_Avoid_: App, workspace, product, checkout

**Add a Project**:
How a git repository becomes a Project. Use a folder already on this Mac, or clone a GitHub repository onto this Mac.
_Avoid_: Import, add checkout, add workspace

**Project scope**:
The drawer limited to one chosen Project.
_Avoid_: Filter, workspace, context switch

**View all**:
The drawer with no Project restriction.
_Avoid_: All projects, everything, global view

**Session**:
A long-lived conversation in one Project. You talk. The Worker runs it. A Session names a provider, a model, and effort.
_Avoid_: Chat, thread, Ask, Agent

**Skill**:
A `SKILL.md` in the Project or installed on this machine (`~/.agents/skills`, `~/.grok/skills`, Grok's bundled catalog, and the same for Claude, Codex, and Cursor). Factory does not keep its own Skill catalog in the app.
_Avoid_: Prompt, instruction, rule, cursor skill

**Worker**:
This Mac, as Factory sees it. One Worker per Factory. Offline means this Mac is not running.
_Avoid_: Server, agent runner, backend, menu bar

**Pairing**:
How a phone learns which Factory to use. The phone may be on the same Wi-Fi, a tailnet, or a public tunnel.
_Avoid_: Device connection, IP setup, login

**Provider**:
Cursor, Codex, Grok, Claude Code, or an OpenAI-compatible API. A Session names one.
_Avoid_: Vendor, model host, backend

**Device**:
An iOS Simulator on this Mac. Factory can boot it and stream it so you can watch, tap, and swipe.
_Avoid_: emulator, phone, preview pane

**Roadmap**:
The per-Project list of work you plan to do later. You order it by hand.
_Avoid_: Backlog, board, issues, tickets

**Roadmap Item**:
One entry on a Roadmap. It is either a Feature or a Fix. It has a Markdown description, Requirements, a status (Idea, Planned, In progress, Done, Dropped), at most one Category, any number of tags, and at most one Release.
_Avoid_: Ticket, issue, card, task

**Requirement**:
One line on a Roadmap Item's checklist that says what done means. You can tick it off.
_Avoid_: Acceptance criteria, subtask

**Category**:
The area of the product a Roadmap Item belongs to, such as Devices. Each Project has its own Categories. An item has one or none.
_Avoid_: Epic, area, component

**Release**:
A named target version for a Project, such as `v1.3`. A Roadmap Item can aim at one.
_Avoid_: Milestone, version, sprint

**Build**:
The Helix Loop run over one Roadmap Item. A Planner splits the item into Checkpoints, each with a test plan and, if it changes what you see, an HTML prototype. Each Checkpoint gets failing tests first, then an implementation, must pass every Gate, and ends in a commit on the Build's own branch and worktree. You stop it twice: to approve the plan, and to try the finished Build.
_Avoid_: Pipeline, run, job, loop

**Checkpoint**:
One small, ordered slice of a Build that you can review in minutes. You approve the list before any code is written. Feedback on the finished Build becomes new Checkpoints.
_Avoid_: Step, subtask, milestone

**Gate**:
A hard stop a Checkpoint must pass before it is committed: Behavior (the Project's check command), UI (a visual and a behavior reviewer compare the running app to the prototype; skipped when the Checkpoint changes no UI), and Review (two adversarial reviewer Sessions, every finding fixed). A failed Gate sends the findings to a fresh fixer Session, then every Gate runs again.
_Avoid_: Check, stage, review step

**Notes**:
Feedback you gave on a Build. Every later prompt in that Build includes it, and the agent records the general lesson in the repo's LEARNINGS.md, which every future agent reads.
_Avoid_: Memory, comments
