---
version: 1
slug: "expo-chats"
primary_target: "expo/src/app/(drawer)/chats.tsx"
related_targets: ["expo/src/chats/Conversation.tsx", "expo/src/chats/ProjectTools.tsx", "expo/src/chats/ui.tsx"]
---

# Expo Chats

Visitor mode: Operate

## Audience and task

The Factory operator talks to Codex or Grok in a Project, reviews changed files, commits selected content, and runs commands on this machine. The existing session and Project APIs own these operations. Chats remain separate from Jobs and Workflows.

## Direction contract

Extend Factory's existing visual system. Keep its dark Notara-like chrome, system type, tonal panel separation, and inherited violet accent. This work adds no brand or global token changes. The current Expo theme remains the authority for color values and light/dark behavior.

The conversation has the main reading area, with a composer containing attachments, model controls, and Send or Stop. Metadata stays quieter than message text. Project tools share the conversation header so reviewing code and running commands do not require leaving Chats.

Below 1,000, show one full-width list or conversation. Changes and Terminal replace the visible conversation panel while keeping it mounted. At 1,000, retain the 290-wide list beside the main panel; at 1,280, tools occupy a 400-wide third column. Local message, commit, selection, and command state survives panel toggles within the current mounted Project and conversation.

Use [T3 Code's mobile app](https://github.com/pingdotgg/t3code/tree/main/apps/mobile) as the conceptual interaction reference. No code was copied. Full T3 parity is outside this implementation. Terminal is noninteractive, starts a fresh shell per command, stops after 120 seconds, and shows the most recent 20 commands. Commits use selected working tree files and preserve unrelated staging; there is no push, pull request, or branch-switching UI.

## Evidence and limits

See `docs/chats.md` for capabilities and verification. Desktop and phone browser captures are `.impeccable/review/chats-desktop.png` and `.impeccable/review/chats-phone*.png`. Browser checks exercised branch/diff output, `pwd`, the phone conversation, and retained drafts and file selection. Automated suites, type checks, and Expo web export passed. Native simulator behavior remains untested.

The implementation went through the scoped finish review and one-fix process. Keep the final review verdict with the review handoff rather than treating test success as a visual verdict.

## Preexisting documentation drift

`PRODUCT.md` describes a web platform and a Settings redesign, so it does not yet describe Expo Chats. The older `src-pages-sessionworkspace-tsx` brief still says VASA and describes a different session layout. These documents were left unchanged. This brief applies only to Expo Chats and does not redefine Factory's global design system.
