# Repo picker lists Hosted bot App grants

The Hosted bot App must already cover a repo before Lab can finish bot confirm. Listing every repository the User's GitHub session can see inverts that dependency.

**Decision.** The Repos tab always shows the Hosted bot App install/configure CTA. The picker lists only repositories the App installation grants, intersected with repos the User's session can see, via `GET /user/installations` plus `GET /user/installations/{id}/repositories`. Enable still runs bot confirm then EncryptionKey sync when needed. `GET /user/repos` is the fallback when the Hosted bot App is unset.

**Rejected.** Listing all session repos and filtering client-side after N `/repos/.../installation` probes. Per-row "let hakase in" as the install path.
