# Factory

A personal control plane for running agents across your product repos. You sit here. Agents do the work.

Factory is three processes on one machine: a Convex backend, a local worker that touches your checkouts, and an Expo app (web, iOS, or Android) where you talk to the agents.

Chats are the daily loop. You pick a Project, talk to Codex or Grok Build, inspect diffs, and run commands. Devices streams an iOS Simulator from this machine into the app. Jobs still exist as staged Workflows the worker can run; Chats do not start a Job.

This is a single-operator tool. There is no multi-user login. Treat the worker as a trusted account on your repos.

## What you need

- [Bun](https://bun.sh)
- Git
- A [Convex](https://convex.dev) account
- At least one agent provider:
  - Codex: sign in with the Codex CLI on this machine, or set `CODEX_API_KEY`
  - Grok Build: `npm install -g @xai-official/grok`, then `grok login`
- macOS and Xcode, only if you want Devices

Cursor keys still drive Workflow Jobs. Chats use Codex or Grok, not Cursor.

## Install

From the repo root:

```sh
bun install
bun --cwd expo install
```

Log into Convex and start the backend. Leave this running.

```sh
bunx convex login
bun run dev:backend
```

`convex dev` writes `.env.local` with `CONVEX_DEPLOYMENT` and `VITE_CONVEX_URL`. Copy that URL into `expo/.env`:

```
EXPO_PUBLIC_CONVEX_URL=https://YOUR-DEPLOYMENT.convex.cloud
```

Put provider credentials in `.env.local` next to the Convex values. Bun loads that file for the worker.

```
FACTORY_PROVIDER=codex
CODEX_API_KEY=
# or, for Grok Build, skip the key and run `grok login`
# CURSOR_API_KEY=          # Workflow Jobs that use Cursor
# OPENAI_API_KEY=
# OPENAI_BASE_URL=         # local / OpenAI-compatible models
# OPENAI_MODEL=
```

`FACTORY_PROVIDER` is the default when an Agent does not name a provider. Valid values are `cursor`, `codex`, `grok`, and `openai`.

Start the worker. The first run needs the Convex URL. After that, `bun run worker` is enough.

```sh
bun run worker --url https://YOUR-DEPLOYMENT.convex.cloud
```

You should see `Factory worker ready.` The worker writes `.factory/worker.json` (mode 0600). Back that file up. Do not commit it. Losing it means re-entering saved secrets.

Start the app:

```sh
bun run dev:expo
```

That is Expo on the web. For a phone or simulator, `bun --cwd expo start`, then open iOS or Android from the Expo menu.

Settings should show this machine as Online. If it says Offline, the worker is not running or it registered against a different Convex deployment.

## Add a Project

A Project is one git checkout Factory is allowed to work in. Point it at a repo you already have locally:

```sh
bunx convex run projects:create '{
  "name": "My App",
  "kind": "web",
  "localPath": "/absolute/path/to/the/repo",
  "githubRepo": "",
  "defaultRuntime": "local"
}'
```

`kind` is `web`, `expo`, or `mixed`. `githubRepo` can stay empty for a local checkout. `defaultRuntime` should be `local` unless you are running a Cursor cloud Job.

The drawer lists Projects under Working on. **View all** shows every Chat and Job. Choosing a Project scopes the lists to that repo.

The worker also seeds Factory Skills and a Feature Workflow on first start. You do not create those by hand.

## Chats

Open Chats, pick a Project in the drawer, then New chat.

Choose Codex or Grok Build, a model, and effort. Type a message. Attachments are images. The worker claims the Session and streams into the thread. Stop agent cancels a running turn. Permission prompts appear in the conversation when the agent needs a decision.

**Changes.** Current branch and dirty files for that Project. Inspect a diff, uncheck files you do not want, write a message, Commit files. Factory does not push or open a pull request from this panel.

**Terminal.** Each command is a new shell in the Project directory. Output streams in. There is no persistent `cd`, no interactive programs, and a 120 second limit. Stop command cancels queued or running work.

The local worker has to be running for messages, Git, and commands. If it is not, the Chat queues and sits there.

More detail lives in [docs/chats.md](docs/chats.md).

## Devices

Devices talks to iOS Simulators on this machine. The worker starts the device hub itself.

1. Confirm Settings shows this machine Online.
2. Open Devices and start preview.
3. Pick a Simulator and boot it if it is shut down.
4. When the stream appears, tap and swipe in the preview. Home is on the toolbar.

This needs macOS with Xcode. An offline worker or a machine without Simulator support shows an empty state instead of a stream.

## Jobs and Workflows

A Job is one request against one Project, executed through a Workflow of Stages (plan, implement, verify, PR). Lanes on the board are Queued, Needs Grilling, Planning, Plan Review, Building, Code Review, and PR. When a Stage needs you, it opens an Ask in Factory and waits.

Chats do not create Jobs. The worker still claims Jobs and runs them with Cursor, Codex, Grok, or an OpenAI-compatible API, depending on the Agent and `FACTORY_PROVIDER`. Cloud Jobs are Cursor only.

To start a Job from the command line:

```sh
bunx convex run jobs:create '{
  "projectId": "PROJECT_ID",
  "request": "What you want built.",
  "runtime": "local",
  "forceGrill": false
}'
```

Factory language for all of this is in [CONTEXT.md](CONTEXT.md).

## Providers

| Provider | Chats | Jobs | How it authenticates |
| --- | --- | --- | --- |
| Codex | yes | local Jobs | Codex CLI login, or `CODEX_API_KEY` (`OPENAI_API_KEY` as fallback) |
| Grok Build | yes | local Jobs | `grok login`, or `XAI_API_KEY`. Optional `GROK_PATH` |
| Cursor | no | local or cloud | `CURSOR_API_KEY` |
| OpenAI-compatible | no | local Jobs | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` |

Local models are the OpenAI-compatible provider (`FACTORY_PROVIDER=openai` plus `OPENAI_BASE_URL`), not a stand-in for Convex.

Managed GitHub clone and encrypted worker environment used to live in Settings. Those Convex APIs are still there; the forms are not in the Expo app yet. For a local Project, `.env.local` plus `projects:create` is enough. The older flow is in [docs/github.md](docs/github.md) and [docs/worker-settings.md](docs/worker-settings.md).

## Layout

```
convex/     backend (Jobs, Sessions, Projects, worker protocol)
worker/     claims Runs and Sessions, clones, talks to agents
expo/       Factory app
skills/     markdown the worker seeds as Factory Skills
docs/       Chats, GitHub, worker environment
```

`.env.local`, `expo/.env`, and `.factory/` stay off git. Keep `.factory/worker.json` with the same checkout as the Convex deployment it registered with. A second clone against a different deployment needs its own identity.

## Checks

```sh
bun run check
bun --cwd expo start --web
```

`bun run check` is the worker, Convex, and web type tests. It does not replace clicking through Chats with the worker online.
