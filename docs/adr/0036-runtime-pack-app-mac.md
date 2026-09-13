# Runtime pack auth is HMAC of dispatch_id with the Hosted bot App PEM

`dispatch_id` is a public correlation id (`run-name: home-${{ inputs.dispatch_id }}` on a public Home repo; ADR-0006, ADR-0013). Anyone who can open the Actions tab can read it. It cannot be the sole secret for fetching sealed vault.

**Decision.** `GET /api/home-runtime` and `PATCH /api/wake-status` require `Authorization: Bearer hakase-pack.<hex>`, where hex is HMAC-SHA256 of the `dispatch_id` bytes keyed with the Hosted bot App PEM (`HOSTED_APP_PRIVATE_KEY` / `INPUT_GITHUB_APP_PRIVATE_KEY`). Lab and the Home Action already hold that PEM. Missing or invalid MAC is 401 before any wake lookup. Hosted bot App unset is 503. `GET /api/wake-status` stays unauthenticated so Action holds can poll it. EncryptionKey still never hits the Worker (ADR-0003). Do not add a new Deployment secret.

**Rejected.** Unguessable `dispatch_id` as the sole secret (the id is a `workflow_dispatch` input and the public run-name). A new shared Deployment secret (Lab and the Action already share the Hosted bot App PEM).
