## Learned User Preferences

- Brand the product as VASA with sidebar tagline "Agentic Software Factory"; use `/vasa.svg` as the sidebar mark and the V mark as the tab icon.
- Factory UI should follow dark Notara-like sidebar chrome.
- Implement on the current branch. Do not create a feature branch unless asked.

## Learned Workspace Facts

- CONTEXT.md is the domain glossary. Use its terms (View all, Project scope, Needs Grilling, Workflow, Job, Run, Ask, Lane) and do not invent synonyms.
- Offline or local model access is via the OpenAI-compatible worker provider (`FACTORY_PROVIDER=openai` + `OPENAI_BASE_URL`), not a Convex replacement.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
