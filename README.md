# Factory

A personal app for Sessions in your product repos. You sit here. The Worker does the work on this Mac.

The Mac menu bar process is the Worker (`bun run desktop`, or `bun run factory`). Expo (web, iOS, Android) is where you talk. Pairing is how a phone learns which Factory — same Wi-Fi, a tailnet, or a public tunnel. The pairing token is the household key.

Chats are the daily loop. You pick a Project, talk to Codex, Grok, Cursor, Claude Code, or an OpenAI-compatible API, inspect diffs, and run commands. Devices streams an iOS Simulator from this Mac.

## What you need

- [Bun](https://bun.sh)
- Git
- At least one agent provider:
  - Codex: sign in with the Codex CLI on this machine, or set `CODEX_API_KEY`
  - Grok Build: `npm install -g @xai-official/grok`, then `grok login`
- macOS and Xcode, only if you want Devices

## Install

From the repo root:

```sh
bun install
bun --cwd expo install
```

Put provider credentials in `.env.local`. Bun loads that file for the worker.

```
FACTORY_PROVIDER=codex
CODEX_API_KEY=
# or, for Grok Build, skip the key and run `grok login`
# CURSOR_API_KEY=
# OPENAI_API_KEY=
# OPENAI_BASE_URL=         # local / OpenAI-compatible models
# OPENAI_MODEL=
```

`FACTORY_PROVIDER` is the default when a Session does not name a provider. Valid values are `cursor`, `codex`, `grok`, and `openai`.

Start the worker:

```sh
bun run worker
```

You should see `Factory worker ready.` The worker writes `.factory/worker.json` and `.factory/mailbox.sqlite`. Back those up. Do not commit them.

One command starts the worker and Expo on the web:

```sh
bun run dev
```

For a phone or simulator, `bun --cwd expo start`, then open iOS or Android from the Expo menu. `bun run dev:expo` is web-only if the worker is already running.

On the same Mac, Expo can pair at `http://127.0.0.1:3402`. Settings shows the LAN address, a Tailscale address when this Mac is on a tailnet, and an optional public tunnel URL. The pairing token is the household key.

Settings should show this machine as Online. If it says Offline, the worker is not running.

## Add a Project

A Project is one git checkout Factory is allowed to work in. Add it in Settings: folder picker, or clone from GitHub. Clones land in `~/Factory` unless you change that folder.

The drawer lists Projects. View all shows every Chat. Choosing a Project scopes the list to that repo.

## Chats

Open Chats, pick a Project in the drawer, then New chat.

Choose a provider, a model, and effort. Type a message. Attachments are images. The worker claims the Session and streams into the thread. Stop agent cancels a running turn. Permission prompts appear in the conversation when the agent needs a decision.

**Changes.** Current branch and dirty files for that Project. Inspect a diff, uncheck files you do not want, write a message, Commit files. Factory does not push or open a pull request from this panel.

**Terminal.** Each command is a new shell in the Project directory. Output streams in. There is no persistent `cd`, no interactive programs, and a 120 second limit. Stop command cancels queued or running work.

The Worker has to be running for messages, Git, and commands. If it is not, the Chat queues and sits there.

More detail lives in [docs/chats.md](docs/chats.md).

## Devices

Devices talks to iOS Simulators on this machine. The worker starts the device hub itself.

1. Confirm Settings shows this machine Online.
2. Open Devices and start preview.
3. Pick a Simulator and boot it if it is shut down.
4. When the stream appears, tap and swipe in the preview. Home is on the toolbar.

This needs macOS with Xcode. An offline worker or a machine without Simulator support shows an empty state instead of a stream.

Factory language is in [CONTEXT.md](CONTEXT.md).

## Providers

| Provider | How it authenticates |
| --- | --- |
| Codex | Codex CLI login, or `CODEX_API_KEY` |
| Grok Build | `grok login`, or `XAI_API_KEY`. Optional `GROK_PATH` |
| Cursor | `CURSOR_API_KEY` in Settings |
| Claude Code | Claude CLI login. Optional `CLAUDE_PATH` |
| OpenAI-compatible | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` |

Local models are the OpenAI-compatible provider (`FACTORY_PROVIDER=openai` plus `OPENAI_BASE_URL`).

Settings holds pairing, provider keys, GitHub, and Add a Project. Pairing is the Mac IP on port 3402, a Tailscale address, or a public tunnel plus the pairing token.

## Layout

```
worker/     mailbox, Sessions, clones, providers
expo/       Factory app
desktop/    Mac menu bar host
shared/     types and helpers
docs/       Chats, GitHub, worker environment
```

`.env.local`, `expo/.env`, and `.factory/` stay off git.

## Checks

```sh
bun run check
```

`bun run check` runs the worker and Expo tests, then typechecks Expo and the worker. `bun run build` is that typecheck. It does not replace clicking through Chats with the worker online.
