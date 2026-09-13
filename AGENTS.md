## Agent skills

### Issue tracker

GitHub Issues via `gh` (`talitha-tools/hakasebot`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default role labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Cursor Cloud specific instructions

The signed-in Lab Dashboard skips GitHub OAuth on localhost when
`LAB_DEV_USER=1` (see `docs/adr/0012-local-dev-user.md`).

Agents test the Dashboard on the local lab port without clicking GitHub.
Repos tab shows stub `hakase-dev/lab-demo` unless `LAB_DEV_GITHUB_TOKEN` is set
(optional Cursor secret, PAT with `repo` and `workflow`). Do not reuse the
Cloud Agent `gh` token.

`/host` needs `HOST_CONSOLE_TOKEN` in `apps/web/.env.local`.

Do not store public branding in Cursor Runtime Secrets. `VITE_SOURCE_REPO_URL`,
`VITE_ACTION_REF`, `VITE_LAB_URL`, `HOSTED_APP_SLUG`, and `HOSTED_APP_CLIENT_ID`
are public strings (code defaults in `apps/web/src/env.ts` for the VITE_*
keys; slug and Client ID live in `apps/web/wrangler.jsonc` vars) and must stay
Environment Variables (ADR-0031). Real credentials (`HOSTED_APP_PRIVATE_KEY`,
`HOSTED_APP_CLIENT_SECRET`, `HOST_CONSOLE_TOKEN`, `BETTER_AUTH_SECRET`,
`LAB_DEV_GITHUB_TOKEN`, `HOSTED_APP_WEBHOOK_SECRET`, `CATALOG_ANTHROPIC_API_KEY`,
`CATALOG_OPENAI_API_KEY`, `CATALOG_XAI_API_KEY`,
`CATALOG_CURSOR_API_KEY`, `CATALOG_ANTIGRAVITY_OAUTH`) stay Runtime Secrets.
