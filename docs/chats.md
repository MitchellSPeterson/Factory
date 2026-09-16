# Chats

Factory's Expo Chats screen lets the operator work with Codex or Grok in a Project, inspect changes, commit selected files, and run commands on this machine. It uses the existing session APIs and worker. Chats do not run a Workflow or create a Job.

## Conversation

Choose a conversation from the searchable list, or start a new chat and choose a Project. Project scope filters the list. The composer supports text, image attachments, provider and model selection, and effort selection. Messages render Markdown and images; permission prompts let the operator answer the agent. A running conversation shows its state and a Stop agent action. The Latest message action returns to the bottom after scrolling up.

On phones, the list, conversation, and Project tools each use the available panel width. All chats returns to the list; Close panel returns from tools to the conversation. At widths of at least 1,000, the list stays beside the conversation. At 1,280 and above, tools open in a third column.

Opening or closing Changes and Terminal keeps the conversation draft, attachments, commit message, file selection, and command draft in memory for the current mounted conversation and Project. This is local UI state, not saved drafts across reloads or navigation to another Project.

## Changes and commits

Changes shows the current branch and changed files. Select a file name to inspect its diff. Files are selected for a commit by default; clear the checkbox for any file to leave out. Enter a commit message, then use Commit files. Status refreshes when the panel opens and periodically while it is visible and idle; Refresh changes also requests an update.

The commit includes the selected files' current working tree content. Renamed files are supported, and unrelated staged changes remain staged. Selection is by file, not by hunk. The worker checks the expected branch before committing. The UI does not offer push, pull request creation, or branch switching.

## Terminal

Terminal runs each command in a new shell starting in the Project's local directory. Output streams into the panel, with exit status or an error when the command finishes. Stop command cancels queued or running work. Select a previous command to reuse it; the history shows the latest 20 terminal operations for the Project.

This is a command runner, not an interactive terminal session. Shell state such as `cd` and exported variables does not persist between commands. Interactive programs are unsupported. Commands stop after 120 seconds, and long output retains the latest 100,000 characters with a truncation notice. The local worker must be running for queued commands and Git operations to execute.

## Implementation and reference

The route is `expo/src/app/(drawer)/chats.tsx`. Conversation rendering and controls live in `expo/src/chats/Conversation.tsx`; Project tools live in `expo/src/chats/ProjectTools.tsx`, with shared controls in `expo/src/chats/ui.tsx`. `convex/projectOperations.ts` queues operations and exposes results; `worker/projectOperations.ts` runs them against the Project directory.

The conceptual reference was [T3 Code's mobile app](https://github.com/pingdotgg/t3code/tree/main/apps/mobile), especially its thread composer, feed, Git controls, commit sheet, and terminal route. No code was copied from that reference. This implementation adopts the conversation and adjacent tools layout within Factory's existing theme; it does not claim full T3 feature parity.

## Verification

Implementation verification passed eight worker operation tests, four Convex operation tests, and nine existing Convex session tests. The fourth operation test verifies that 55 Git refreshes preserve terminal history. The full root Vitest run passed 36 tests before that additional test, and the updated four-test operation suite passed separately. The existing Bun-only test passed separately, and Expo passed 22 tests. Expo/Convex/worker type checks and the final Expo web export also passed.

Live browser checks covered the branch, file diff, a `pwd` command, phone conversation layout, and draft/file-selection retention while tools opened and closed. Review captures are in `.impeccable/review/chats-desktop.png` and `.impeccable/review/chats-phone*.png`. Native simulator behavior has not been tested.

Android and iOS Hermes bundle exports also pass after adding `punycode` as an explicit Expo dependency. The Markdown parser imports this Node built-in by name; native Metro needs the JavaScript package installed. The live Android development bundle on port 8082 returned HTTP 500 before the fix and HTTP 200 afterward. This verifies bundling, not on-device rendering.
