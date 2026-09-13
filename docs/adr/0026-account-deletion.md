# Account deletion wipes product-held User data

Users can leave forever. Rotate only throws away vault ciphertext. Sign-out only clears cookies. Disable and App uninstall release claims but leave the vault. Nothing else erases the User from D1.

**Decision.** Account deletion is a Settings preview → confirm flow (same shape as key rotate). One deep module erases every D1 row keyed by that User's `github_user_id`: vault accounts (cascading slots and repo model lists), repo model list meta, enabled repos, repo setting defaults, encryption key meta, home repo row, wake runs, and repo claims. The browser then clears Encryption key sessionStorage and signs out.

The product does not touch GitHub. On the confirm screen, Settings copy reminds the User to delete or empty their Home repo, uninstall the Hosted bot App if they no longer want it, and revoke Hosted bot App User authorization at GitHub. Posted PR reviews stay as repository-owned history.

Rejected: soft-delete / tombstone (Host already counts `encryption_key_meta` as users; hard delete matches "entirely remove"). Rejected: product-driven Home repo delete, Actions secret scrub, or App uninstall (User owns those surfaces; remind, don't automate). Rejected: per-User cookie revocation tables (auth stays cookie-only; empty D1 is enough after sign-out).

Distinct from deleting a Vault account (one sealed credential row).
