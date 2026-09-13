# Local-dev user session

Cloud Agents cannot click GitHub OAuth. Passing `HOSTED_APP_CLIENT_ID` / `HOSTED_APP_CLIENT_SECRET` still needs a human in the browser, a registered callback, and usually 2FA. That does not unblock dashboard copy or click-through on localhost.

**Decision.** A localhost-only fake User. `LAB_DEV_USER=1` plus the current request origin on `localhost` or `127.0.0.1`. The Lab treats the User as signed in. GitHub `/user` is skipped when there is no PAT, and when `LAB_DEV_GITHUB_USER_ID` is set. A stub repo list fills the Repos tab. Writes that need GitHub still fail unless `LAB_DEV_GITHUB_TOKEN` is set.

`readUserSession` only treats a GitHub account session as signed-in OAuth. Stray cookies (Vite, wrangler, OAuth state) never call `getAccessToken` and are missing. A 401 / `UNAUTHORIZED` with no `account_data` cookie (stale `session_token` only, empty `Error.message`) is also missing, so the fake User still fills in. A 401 while `account_data` is present, and decrypt / refresh failures of a real account cookie, stay errors.

The flag is off unless this request's host is loopback, even if `LAB_DEV_USER=1` ships on a production Deployment or `VITE_LAB_URL` is a public origin (ADR-0038). OAuth remains the production path. `LAB_DEV_USER=1` also adds loopback to better-auth `allowedHosts` so local vite still works when wrangler vars pin the public Lab origin.

If `LAB_DEV_GITHUB_TOKEN` is set and `LAB_DEV_GITHUB_USER_ID` is not, GitHub `/user` runs with that PAT so D1 keys off the token owner. Set `LAB_DEV_GITHUB_USER_ID` only to skip that fetch.

Optional Cursor secret `LAB_DEV_GITHUB_TOKEN` is a PAT with `repo` and `workflow`. Leave it unset unless those writes are wanted. Never put the PAT in a `VITE_*` key. Tests inject `parseDevUser` args. Vitest forces the fake User off so `.env.local` flags cannot leak into unit tests.

**Rejected.** OAuth secrets only (does not skip the GitHub consent screen). Reusing the Cloud Agent `gh` token automatically (scopes are unknown and writes would surprise).
