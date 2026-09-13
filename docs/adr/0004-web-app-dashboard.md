# Web app is a vault gate plus a tabbed Dashboard

Management workloads (accounts, slot order, per-repo overrides) are not sequential. Per-repo install (bot confirm, then EncryptionKey sync) still is. A silent key mint on a new browser when ciphertext already exists would make the User discover the mismatch only when sync fails.

**Decision.** One `/` route after sign-in. A vault gate runs first: `ceremony` (export the new key before tabs mount), `import` (paste the exported key and decrypt one sealed row), or `open`. The Dashboard then owns accounts, model slots, enabled repos, and settings. Tab, expanded repo, and install step live in URL search params. Per-repo install is bot confirm, then browser EncryptionKey sync to the Home repo.

Rotate wipes vault ciphertext, mints a new key, and leaves enabled-repo rows in place so the User can re-sync. `repoNeedsResync` is `synced_epoch < encryption_key_meta.epoch`. `github_user_id` is GitHub's numeric user id.

Server functions accept sealed credentials and metadata only. Catalog list calls use Deployment API keys (ADR-0032). EncryptionKey stays in `sessionStorage` unless the User exports it.

**Rejected.** A one-way funnel that treats accounts and slots as steps of a single repo install. File routes per tab. Re-encrypt-in-place on rotate. Writing EncryptionKey to disk unless exported. Forgetting which repos were enabled across rotate.
