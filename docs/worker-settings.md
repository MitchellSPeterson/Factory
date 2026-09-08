# Managed Projects and environment variables

## Start and pair the worker

On a new worker machine, install the Factory dependencies and Git, then start:

```sh
bun run worker --url https://YOUR-DEPLOYMENT.convex.cloud
```

The URL is public deployment configuration. Factory saves it and generates a private worker identity under `.factory/worker.json` (file mode 0600). Subsequent starts need only `bun run worker`. Existing `.env.local` configuration remains compatible.

Run `bun run worker:pair` on that machine and enter the resulting key under **Settings → Worker**. Treat the pairing key as an administrator credential. Pairing is kept in browser memory and must be repeated after reloading. The key authorizes configuration and import operations for that worker. No ongoing edits to a server `.env` file are needed.

Back up `.factory/worker.json` securely with the worker. It contains the private key needed to decrypt saved values. Do not commit it. Losing it requires pairing a new worker and reentering its variables. Keep this identity outside cloned Project directories. `.factory/` is ignored by Git.

## Add a GitHub Project

1. Connect GitHub and pair the destination worker.
2. Open **Settings → Add from GitHub** (also available on Projects and in the GitHub View all screen).
3. Choose a repository, name, kind, and Workflow. No local path is needed.
4. Click **Add Project and clone**. Its status progresses from queued to cloning to ready. Offline workers pick up queued imports after reconnecting.
5. Open the Project to see its path or retry a failed clone.

Private repositories require **Contents: read** on the GitHub token/App in addition to the activity permissions. The browser encrypts its GitHub token for the selected worker. Convex holds only the encrypted import credential and deletes it when the import completes or fails. Failed imports require a current GitHub connection to retry.

Repositories clone under the worker's `.factory/projects/<Project ID>` directory. Git chooses the repository's default branch. Clones run without Git hooks, submodule initialization, dependency installation, or project scripts. Credentials are supplied through a temporary askpass helper and never included in the remote URL. A retry preserves an existing matching checkout and refuses to replace another directory/repository. Deleting a Project removes its configuration and encrypted variables, but does not delete its checkout.

Managed Projects are tied to one worker. Other workers cannot claim their Runs. Jobs cannot start until cloning finishes. GitHub credentials used for importing are temporary; later git push/pull operations still use the worker's existing git authentication.

## Environment manager

**Settings → Worker → Worker environment** supports:

- `FACTORY_PROVIDER`: `cursor` or `openai`.
- `CURSOR_API_KEY`.
- `OPENAI_API_KEY`, `OPENAI_BASE_URL`, and `OPENAI_MODEL`.

Set other application variables under **Project → Project environment** for managed Projects. Values may be multiline. Names are case-sensitive uppercase environment names. Worker/bootstrap and shell-startup variables are reserved.

Values are encrypted in the browser using AES-GCM with the AES key wrapped by the worker's RSA-OAEP public key. Only the destination worker has the private key. The editor lists variable names and timestamps, not saved values; use Replace to change a value. Neither Convex nor the browser can decrypt stored values.

Each new Run loads its settings and starts in a separate child process. Project values are injected into that process; cloud Cursor Runs also receive their Project values through the SDK's `envVars`. Active Runs retain their original configuration. No Project `.env` file is generated. Provider settings override startup environment variables; removing an override restores any startup value that already existed.

Environment variables are available to code and agents executing the Run. Factory retains its existing trusted-operator access model for Workflows, Skills, and legacy Jobs; worker pairing is not a replacement for application-wide multi-user authorization. Run only trusted Projects/Workflows on a worker holding secrets. This editor manages worker and Run settings, not Convex deployment secrets or frontend build-time configuration.

## Tests

`bun run check` includes backend authorization/scope/import lifecycle tests, real local Git clone tests, encryption roundtrips, destination/tampering rejection, frontend/backend/worker type checks, and the existing worker suite. `bun run build` verifies the frontend build.
