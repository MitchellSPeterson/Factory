# GitHub in Factory

Open **GitHub** in the sidebar and connect your GitHub account. The first version includes repository selection when adding or editing Projects, open issues, open pull requests, recent GitHub Actions runs, and an issue-to-Job form that carries over the description, URL, labels, and milestone. Select a Project scope to view activity. Lists are paginated; use Refresh to fetch changes.

## Connect with a token

1. Open https://github.com/settings/personal-access-tokens/new.
2. Choose the resource owner and only the repositories Factory should access.
3. Grant **read-only Contents, Issues, Pull requests, and Actions** repository permissions. Metadata is included by GitHub. Choose an expiration date.
4. If an organization requires approval, wait for that approval.
5. Paste the token into Factory's GitHub connection form. Do not put it in source code or send it in chat.

The token stays in React memory and is sent directly to `api.github.com`. Reloading or closing Factory ends the local connection. Disconnect clears it locally; revoke it in GitHub settings if you want to invalidate the token itself. Repository discovery may show repositories outside a fine-grained token's selected permissions; their activity will remain inaccessible unless GitHub permits it.

## Connect with a GitHub App

1. Register an App at https://github.com/settings/apps/new. Use a unique App name and your Factory URL as the homepage.
2. Enable **Device Flow**. This flow does not require an OAuth callback URL or client secret.
3. Disable webhooks for this first version, which refreshes on demand.
4. Grant read-only **Contents**, **Issues**, **Pull requests**, and **Actions** repository permissions.
5. Install the App on the selected repositories through its Install App page.
6. In Factory, expand **Connect with a GitHub App**, enter the public **Client ID** (not App ID), and click sign in.
7. Open GitHub's device verification page using the displayed link and enter the code. Factory completes sign-in automatically.

Only the public client ID is saved in localStorage. Device authorization passes through two stateless Convex actions because GitHub's login endpoints do not support browser CORS. The resulting user access token stays in browser memory. No GitHub credentials or private repository activity are persisted in Factory tables. GitHub enforces access as the intersection of the App installation and the authorizing user's permissions. Tokens are not automatically refreshed; reconnect when one expires.

## Scope

Creating a Job saves the selected issue's content and metadata in Factory's existing database and may start the configured Workflow. Factory's existing database access model is unchanged; this integration does not add multi-user authentication to Factory. GitHub connection permissions do not grant the worker credentials: local git operations and cloud agents continue using their existing authentication.

Pull request details and CI logs link out to GitHub. This version does not merge PRs, post comments, rerun CI, or receive webhooks. GitHub Enterprise hosts are not supported yet.

## Verification

Run `bun run check` and `bun run build`. The GitHub tests cover repository path validation, issue metadata transfer, credential destination, cancellation propagation, and access/rate-limit errors. Complete a live sign-in and check a selected private repository after supplying your own token or registering the App.

For automatic cloning and environment settings, see [worker settings](worker-settings.md).
