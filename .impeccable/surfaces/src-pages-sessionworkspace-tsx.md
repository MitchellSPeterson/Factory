---
version: 1
slug: "src-pages-sessionworkspace-tsx"
primary_target: "src/pages/SessionWorkspace.tsx"
related_targets: ["src/pages/SessionsPage.tsx","src/pages/SessionPage.tsx","src/index.css"]
---

# Sessions

Visitor mode: Operate

## Audience and task

The operator talks to Grok Build or Codex in a Project without leaving VASA. They start a conversation, watch it stream, and follow up. Sessions are not Jobs and do not use a Workflow.

## Direction contract

THESIS: Sessions is the conversation, not a form that launches one. It refuses a settings card plus a grid of past chats. You type, the agent answers in place, the way ChatGPT and Codex already trained the hand.

OWN-WORLD: VASA canvas and sidebar stay. Inside the board: ChatGPT/Codex conversation grammar. History rail of titles, centered 48rem measure, user message as a right-hand pill, assistant as unbubbled prose with a live caret, composer as one rounded field that holds the textarea and the provider/model/effort pickers.

STORY: Open Sessions. If nothing is selected, the greeting and composer sit in the middle. Send, and the composer docks to the bottom while tokens stream. History on the left is how you return. Stop and delete live in the thin header, never in the composer.

FIRST VIEWPORT: Full-bleed board filling main. Left ~240px: New session, then titles with a quiet status. Right: either a centered greeting or the thread. The composer is a 28px-radius field at the bottom of the conversation column (vertically centered with the greeting when empty). Inside it: textarea, then a bar of provider, model, effort, optional Project, send. Send is a circular arrow; while a turn runs it becomes Stop.

FORM: ChatGPT and Codex conversation UI, named by the user as the products this should sit alongside. Specified canon path, no concept-seed.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
