# Prefs and sealed vault live in D1; Home repo is runtime-only

D1 is the Dashboard store for vault accounts, model slots, and enabled-repo prefs. The Home repo is a runner. Putting a second copy of prefs on git would go stale, make prefs public, and make the Home repo more than a runner.

**Decision.** D1 is the only prefs and sealed-vault store. The Home repo holds the dispatcher workflow and Actions secrets (EncryptionKey plus Hosted bot App PEM). On Wake, the Home Action fetches a Runtime pack from the Worker (`GET /api/home-runtime?dispatch_id=…`): sealed vault ciphertext plus the prefs the job needs for that consumer. Pack and wake-status write auth is HMAC of `dispatch_id` with the Hosted bot App PEM (ADR-0036). No Contents API flush. Enable, disable, slot, and account writes are D1-only. The next Wake always sees current prefs.

Browser secret sync writes only the EncryptionKey to Home Actions secrets. The Runtime pack supplies the credential vault and model queue at job start.

**Rejected.** Workers KV or R2 as a second copy (the relational data already lives in D1). Passing prefs in `workflow_dispatch` inputs (large, visible in the Actions UI, awkward for sealed vault blobs). Committing prefs or sealed vault into the Home repo.
