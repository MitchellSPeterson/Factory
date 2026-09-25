# GitHub in Factory

Connect GitHub when you add a Project with **Clone from GitHub**. Paste a token. Factory lists repositories that token can see. Type `owner/repo` if the list missed one.

## Connect with a token

1. Open https://github.com/settings/personal-access-tokens/new.
2. Choose the resource owner and only the repositories Factory should access.
3. Grant **read-only Contents**, **Issues**, and **Pull requests** repository permissions. Metadata is included by GitHub. Choose an expiration date.
4. If an organization requires approval, wait for that approval.
5. Paste the token into Factory's GitHub connection form. Do not put it in source code or send it in chat.

The token is stored in this Factory instance and sent directly to `api.github.com`. Every client device using this instance shares the connection. Disconnect removes it from Factory; revoke it in GitHub settings if you want to invalidate the token itself. Repository discovery may show repositories outside a fine-grained token's selected permissions; cloning those repositories will fail unless GitHub permits it.

## Connect with a GitHub App

1. Register an App at https://github.com/settings/apps/new. Use a unique App name and your Factory URL as the homepage.
2. Enable **Device Flow**. This flow does not require an OAuth callback URL or client secret.
3. Disable webhooks for this first version, which refreshes on demand.
4. Grant read-only **Contents**, **Issues**, and **Pull requests** repository permissions.
5. Install the App on the selected repositories through its Install App page.
6. In Factory, expand **Connect with a GitHub App**, enter the public **Client ID** (not App ID), and click sign in.
7. Open GitHub's device verification page using the displayed link and enter the code. Factory completes sign-in automatically.

The public client ID stays in this browser. Device authorization passes through the Worker because GitHub's login endpoints do not support browser CORS. The resulting user access token is stored on this Mac. GitHub enforces access as the intersection of the App installation and the authorizing user's permissions. Tokens are not automatically refreshed; reconnect when one expires.

## Scope

Factory's existing database access model is unchanged; this integration does not add multi-user authentication to Factory. GitHub connection permissions do not grant the worker credentials: local git operations and cloud agents continue using their existing authentication. GitHub Enterprise hosts are not supported yet.

A Job can still record a GitHub issue URL, milestone, and tags from the New Job form. Those fields are typed in by hand.

## Roadmap links

A Roadmap Item can link to a GitHub issue or pull request. Paste a full URL, `owner/repo#123`, or `#123` (uses the Project's repository). Factory fetches the title and state and keeps them up to date on request. You can also import an open Issue as a new Roadmap Item; its labels become tags and its checklist lines become Requirements. This needs the same GitHub connection, with Issues and Pull requests read access.

## Verification

Run `bun run check`. The GitHub tests cover storing the connection on the Factory instance. Complete a live sign-in and import a selected private repository after supplying your own token or registering the App.

For automatic cloning and environment settings, see [worker settings](worker-settings.md).
