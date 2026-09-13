# Host console is the operator backend at `/host`

The person who deploys the web-app Worker is not the Lab User. Those audiences must not share a surface or an auth scheme.

**Decision.** A separate Host console at `/host` shows Deployment config, D1 health, and aggregate usage. Snapshot stays read-only except one write: delete Model catalog KV keys (`catalog:v1:<engine>`) so a stale 24h cache can be busted. Auth is `HOST_CONSOLE_TOKEN` (Bearer, stored in operator `sessionStorage`), not GitHub OAuth and not Lab sign-in. When the token is unset, `/host` is 404 and host RPCs are unavailable.

No secret values in the snapshot. Hosted bot App shows slug only. Sign-in shows whether `HOSTED_APP_CLIENT_ID` is set. The webhook checklist ticks URL and subscribed events when they match the Hosted bot App on GitHub. Stats are `COUNT(*)` only; no `github_user_id` lists. Host console must not import vault crypto, session-key modules, or Lab user-session helpers.

**Rejected.** Host console on the User Dashboard. GitHub OAuth or repo `admin` permission as host auth. Exposing ciphertext, EncryptionKeys, or per-user PII. Live editing of `HOSTED_APP_PRIVATE_KEY` or Client secret in the browser. Curating model ids here (users load them from the Deployment Model catalog, ADR-0032).
