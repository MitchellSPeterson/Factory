# GitHub in Factory

Open **Settings → GitHub** and connect your GitHub account. The connection is used to list repositories when adding or editing Projects and to clone them onto this machine.

## Connect with a token

1. Open https://github.com/settings/personal-access-tokens/new.
2. Choose the resource owner and only the repositories Factory should access.
3. Grant **read-only Contents** repository permission. Metadata is included by GitHub. Choose an expiration date.
4. If an organization requires approval, wait for that approval.
5. Paste the token into Factory's GitHub connection form. Do not put it in source code or send it in chat.

The token stays in React memory and is sent directly to `api.github.com`. Reloading or closing Factory ends the local connection. Disconnect clears it locally; revoke it in GitHub settings if you want to invalidate the token itself. Repository discovery may show repositories outside a fine-grained token's selected permissions; cloning those repositories will fail unless GitHub permits it.

## Connect with a GitHub App

1. Register an App at https://github.com/settings/apps/new. Use a unique App name and your Factory URL as the homepage.
2. Enable **Device Flow**. This flow does not require an OAuth callback URL or client secret.
3. Disable webhooks for this first version, which refreshes on demand.
4. Grant read-only **Contents** repository permission.
5. Install the App on the selected repositories through its Install App page.
6. In Factory, expand **Connect with a GitHub App**, enter the public **Client ID** (not App ID), and click sign in.
7. Open GitHub's device verification page using the displayed link and enter the code. Factory completes sign-in automatically.

Only the public client ID is saved in localStorage. Device authorization passes through two stateless Convex actions because GitHub's login endpoints do not support browser CORS. The resulting user access token stays in browser memory. No GitHub credentials are persisted in Factory tables. GitHub enforces access as the intersection of the App installation and the authorizing user's permissions. Tokens are not automatically refreshed; reconnect when one expires.

## Scope

Factory's existing database access model is unchanged; this integration does not add multi-user authentication to Factory. GitHub connection permissions do not grant the worker credentials: local git operations and cloud agents continue using their existing authentication. GitHub Enterprise hosts are not supported yet.

A Job can still record a GitHub issue URL, milestone, and tags from the New Job form. Those fields are typed in by hand.

## Verification

Run `bun run check` and `bun run build`. The GitHub tests cover credential destination, cancellation propagation, and access/rate-limit errors. Complete a live sign-in and import a selected private repository after supplying your own token or registering the App.

For automatic cloning and environment settings, see [worker settings](worker-settings.md).
