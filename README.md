# hakasebot

GitHub Action that runs a login-auth coding CLI on pull requests and posts a
native GitHub review. This repo is also the Cloudflare Lab at
https://hakase.talitha.tools. Reviews run on a public Home repo on the User's
account so consumer orgs do not spend Actions minutes and GitHub-hosted
runners stay free.

Users install from Lab. See
[`docs/how-to-get-a-native-review.md`](docs/how-to-get-a-native-review.md).
Terms live in [`CONTEXT.md`](CONTEXT.md). Decisions live in [`docs/adr/`](docs/adr/).

## Layout

Bun workspaces. Inside a package, `#/` is `src/`. Across packages, import
`@hakasebot/core/...`.

- `apps/web`: the Lab web app (TanStack Start on Cloudflare Workers)
- `packages/action`: the composite Action runtime (`exports: {}`, executed from
  root `action.yml`)
- `packages/core`: shared domain, GitHub REST, vault, wake, Runtime pack, Model
  catalog
- `packages/test-kit`: shared test helpers and fixtures

Needs bun 1.4.0 (`package.json` `engines`, and `action.yml`).

## Getting started

```bash
bun install
./scripts/setup-lab.sh
```

That walks Hosted bot App registration, `apps/web/.env.local`, D1, KV, custom domain, deploy, and Worker secrets. To do it by hand: copy `apps/web/.env.example` to `apps/web/.env.local` and run `bunx --bun @better-auth/cli secret` for `BETTER_AUTH_SECRET`.

`HOSTED_APP_CLIENT_ID` and `HOSTED_APP_CLIENT_SECRET` are required to boot.
PEM, slug, and webhook secret can stay blank until the bot is needed.

```bash
bun run dev
```

Lab is http://localhost:47821. Cloud Agents cannot click GitHub. On loopback,
`LAB_DEV_USER=1` treats the User as signed in (ADR-0012). That flag also
allowlists loopback for better-auth when wrangler vars pin a public
`VITE_LAB_URL` (ADR-0038). It is off on any non-loopback host. GitHub writes
still need `LAB_DEV_GITHUB_TOKEN` (PAT with `repo` and `workflow`). Set
`LAB_DEV_GITHUB_USER_ID` only to skip GitHub `/user`. Do not reuse the Cloud
Agent `gh` token.

## One GitHub App (two token kinds)

Do not create a separate OAuth App for Lab login. One GitHub App issues both
token kinds (see
[`docs/adr/0030-hosted-app-user-sign-in.md`](docs/adr/0030-hosted-app-user-sign-in.md)).

|         | User token (`ghu_`)                                                                      | Installation token                                                                                  |
| ------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Where   | same App, Client ID / Client secret                                                      | same App, Client ID / PEM                                                                           |
| Env     | `HOSTED_APP_CLIENT_ID` / `HOSTED_APP_CLIENT_SECRET`                                      | `HOSTED_APP_CLIENT_ID` / `HOSTED_APP_PRIVATE_KEY` / `HOSTED_APP_SLUG` / `HOSTED_APP_WEBHOOK_SECRET` |
| Acts as | the signed-in User (Lab, Home bootstrap, browser Actions secrets)                        | the Bot (reviews, webhooks, wake)                                                                   |
| Access  | App registration permissions. better-auth `disableDefaultScope: true`, no classic scopes | skinny subset posted by `mintInstallationToken` (never admin / contents-write / workflows)          |

User tokens expire in about eight hours; better-auth `getAccessToken` refreshes
from the account-cookie refresh token. JWT `iss` is the Client ID. There is no
`HOSTED_APP_ID`. Home secret `HAKASEBOT_APP_ID` still uses that name; the value
is the Client ID (ADR-0039). Do not put the Client secret in
`HOSTED_APP_PRIVATE_KEY` (that field needs an App PEM).

## Set up the GitHub App

The Lab signs in with GitHub only. better-auth runs in **stateless cookie
mode** with **no session table**: the session and GitHub User token (plus
refresh token) live in sealed cookies. Vault accounts, enabled repos, and Home
runtime metadata live in D1. Tradeoff: you cannot revoke a session server-side
without rotating `BETTER_AUTH_SECRET` (or bumping the cookie-cache version).

1. Copy `apps/web/.env.example` to `apps/web/.env.local` if you have not
   already, and generate `BETTER_AUTH_SECRET` as in Getting started.
2. Create **one GitHub App** (Developer settings → GitHub Apps → New GitHub
   App). That App is both Lab sign-in and the Hosted bot.
   - Homepage URL: `VITE_LAB_URL` (local: `http://localhost:47821`).
   - Callback URL: `{VITE_LAB_URL}/api/auth/callback/github`.
   - Leave **Request user authorization (OAuth) during installation**
     **unticked**. Sign-in stays a Lab button.
   - Leave Device Flow off.
   - Webhook: Active. URL `{VITE_LAB_URL}/api/github-webhook`. Paste a
     random HMAC into Webhook secret → `HOSTED_APP_WEBHOOK_SECRET`.
   - Repository permissions (fat registration; installation tokens stay skinny
     in `mintInstallationToken`): Administration Read and write; Contents Read
     and write; Workflows Read and write; Actions Read and write; Issues Read
     and write; Pull requests Read and write. Metadata stays Read-only
     (GitHub sets it). Account: Email addresses Read-only. Leave Organization
     permissions on No access.
   - Subscribe to events: `pull_request`, `issue_comment`,
     `pull_request_review_comment`. GitHub Apps always receive
     `installation` and `installation_repositories`; those are not
     in Subscribe to events and cannot be ticked.
   - Where can this GitHub App be installed: Any account.
   - After create: copy slug, Client ID, and Client secret; Generate a
     private key (PEM). The Client secret is not the PEM.
3. Put Client ID / Client secret in `HOSTED_APP_CLIENT_ID` /
   `HOSTED_APP_CLIENT_SECRET`. Put the PEM in `HOSTED_APP_PRIVATE_KEY` and the
   slug in `HOSTED_APP_SLUG`. Leave PEM and slug blank if this Deployment has
   no bot yet.
4. Permissions come from the App registration, not authorize-time scopes.
   `apps/web/src/lib/auth.ts` sets `disableDefaultScope: true` so better-auth
   does not request classic `repo` / `workflow`.

`VITE_LAB_URL` is the only public origin (ADR-0038). Hosted bot App homepage,
callback, webhook, Home dispatcher `lab_url`, and better-auth all read it.
There is no `BETTER_AUTH_URL`.

The Lab install CTA opens
`https://github.com/apps/<HOSTED_APP_SLUG>/installations/new`. Install that App
on each consumer repo (webhooks + posting) and on the Home repo (dispatch). The
EncryptionKey is written to the Home repo only, from the browser. Prefs and
sealed vault stay in D1 and reach the runner as a Runtime pack. Pack fetch
(`GET /api/home-runtime`) and wake-status writes are HMAC of `dispatch_id`
keyed with the Hosted bot App PEM (ADR-0036).

## Engines

Claude, Codex, Grok, and Antigravity mint vault plaintext through Vendor login
in Lab (ADR-0037). Those Accounts forms have no paste box. Cursor stays
paste-only: the user API key from the Cursor dashboard (the documented
login-derived CI artifact). At spawn, hakasebot maps that secret to
`CURSOR_API_KEY` so the official headless CLI env works. There is no second
API-key-only engine variant.

CLI spawn lives in `packages/action/src/engines.ts` behind `ReviewRuntime.run`.
The web app cannot import `@hakasebot/action` (`exports: {}`, plus undeclared
workspace deps fail resolution). `.server` / `.client` suffixes are enforced
at `vite build`, not by lint (ADR-0029).

## Env

Typed env lives in `apps/web/src/env.ts` (`@t3-oss/env-core`), including
product defaults and `parseDeploymentConfig`. Fork-settable Deployment config
types live in `apps/web/src/deployment-config.ts`.

## Deploy to Cloudflare Workers

```bash
bun run deploy
```

Put production secrets with `wrangler secret put` (run in `apps/web/`) for the
credential keys in `apps/web/.env.example`. `HOSTED_APP_SLUG` and
`HOSTED_APP_CLIENT_ID` are Worker vars in `apps/web/wrangler.jsonc`, not
secrets. The `VITE_*` keys are also vars there. Vite inlines `VITE_*` at
`bun run build`, so set them in the environment that runs the build as well as
in wrangler vars, or the client bundle and the Worker will disagree.

Sessions are sealed cookies, not D1 or KV. D1 holds vault, repo, and wake
rows. KV holds the Model catalog cache. `./scripts/setup-lab.sh` creates or
binds those, sets the custom domain, deploys, then applies migrations with
`bun run db:migrate:remote` (or `db:migrate:local` for Miniflare).

## Fork and deploy your web app

A fork re-points Hosted bot App credentials, Action ref, and Lab URL /
branding through env. You do not edit product code.

1. Follow [Set up the GitHub App](#set-up-the-github-app) for **your** App
   (same registration for Lab sign-in and the Bot).
2. Set `VITE_ACTION_REF` to your composite Action (`owner/repo@ref`).
3. Set `VITE_LAB_URL` to the public origin of this Lab. Set
   `VITE_SOURCE_REPO_URL` to your fork on GitHub. Update the GitHub App
   homepage, callback, and webhook to that origin.
4. For a Worker deploy, `wrangler secret put` each server key
   (`HOSTED_APP_PRIVATE_KEY`, `HOSTED_APP_WEBHOOK_SECRET`,
   `HOSTED_APP_CLIENT_SECRET`, `BETTER_AUTH_SECRET`, `HOST_CONSOLE_TOKEN`, and
   the `CATALOG_*` vendor list keys). `HOSTED_APP_SLUG` and
   `HOSTED_APP_CLIENT_ID` are Worker vars (see `apps/web/wrangler.jsonc`), not
   secrets. GitHub treats the Client ID as public. If you previously
   `wrangler secret put HOSTED_APP_CLIENT_ID`, delete that secret so the var
   wins.

`CATALOG_XAI_API_KEY` is the odd one. xAI refuses the model list until the team
has prepaid credits, but listing never spends them. Mint the key at
console.x.ai with Chat models, the Models endpoint only, and 1 token per
minute so the list autofilters and the key cannot chat.

`CATALOG_ANTIGRAVITY_OAUTH` is the `agy` OAuth JSON from the OS keyring
(Secret Service `service=gemini`, `username=antigravity`). Desktop `agy` does
not write a token file. `secret-tool lookup` fails on KDE (`text/plain;
charset=utf8`). Dump with python libsecret:

```sh
python3 - <<'PY'
import gi
gi.require_version("Secret", "1")
from gi.repository import Secret
s = Secret.Service.get_sync(Secret.ServiceFlags.OPEN_SESSION, None)
i = s.search_sync(
    None,
    {"service": "gemini", "username": "antigravity"},
    Secret.SearchFlags.UNLOCK | Secret.SearchFlags.LOAD_SECRETS,
    None,
)[0]
print(i.get_secret().get().decode())
PY
```

The Worker refreshes that blob and scrapes Antigravity's model list. Catalog
keys are optional locally; a missing key makes that engine's picker fail and
the custom-string path still works.

### Host console (`/host`)

The Deployment operator (not Users) can open `/host` for instance status:
public deployment config, D1 health, and aggregate usage counts. Model catalog
cache clear drops the KV lists so the next picker open fetches fresh. No
secrets or per-user identifiers are returned. Model ids come from a live vendor
list when a User adds a slot, not from host curation.

1. Generate a long random token and set it as `HOST_CONSOLE_TOKEN` (local:
   `apps/web/.env.local`; production: `wrangler secret put HOST_CONSOLE_TOKEN`).
2. Open `/host`, paste the token once. It is stored in `sessionStorage` only and
   sent as a Bearer token to host RPCs.
3. When `HOST_CONSOLE_TOKEN` is unset, `/host` returns 404 and host RPCs are
   unavailable.

## Action

`action.yml` at the repo root. The Home dispatcher `uses:` this repo. The
composite step installs the action workspace with
`bun install --frozen-lockfile --production --filter '@hakasebot/action'`,
then runs `bun packages/action/src/action-main.ts`.

## Testing

```bash
bun run test
bun run lint
bun run format:check
bun run lint:style
```

`bun run generate` (also `pretest`, and apps/web `prebuild` / `predev`) compiles
Paraglide, Wrangler types, and the route tree. Lint and format do not; run
generate first on a clean tree. CI (`.github/workflows/ci.yml`) formats and
stylelints first, generates once, then oxlint, tests, and `vite build`. PRs
also commitlint the branch range. Web scripts from the repo root go through
`bun run web -- <script>` (`web` is `bun run --cwd apps/web`).

## Licence

hakasebot

Copyright (C) 2026 talitha.tools

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU Affero General Public License as published by the Free
Software Foundation, either version 3 of the License, or (at your option) any
later version.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

```
SPDX-License-Identifier: AGPL-3.0-or-later
```
