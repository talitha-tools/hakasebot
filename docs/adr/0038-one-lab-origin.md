# Public Lab origin is one env var

Hosted bot App callback, webhook, Home dispatcher `lab_url`, and better-auth `baseURL` must agree. Two origin env vars drift.

**Decision.** `VITE_LAB_URL` is the public Lab origin. Hosted bot App homepage / callback / webhook and the Home dispatcher read it. There is no `BETTER_AUTH_URL`.

better-auth uses the current request origin when that host is the lab origin. If the lab origin is loopback, other loopback hosts are allowed too. `LAB_DEV_USER=1` also allowlists loopback even when `VITE_LAB_URL` is the public origin, so local `vite dev` still works when wrangler vars pin production. Unofficial hosts (`workers.dev`, previews) do not get a canonical-origin fallback. The localhost fake User (ADR-0012) still keys off the request origin.

GitHub Actions and the Hosted bot App registration have no request to read, so they keep the configured origin.

**Rejected.** A second auth env var. Deriving dispatcher / webhook URLs from `Host`.
