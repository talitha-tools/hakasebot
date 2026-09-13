# Engine credentials are sealed in D1; the Worker never sees plaintext

The review runtime needs vendor credentials in GitHub Actions. The web app must not hold those secrets in plaintext. Native vendor OAuth as a Worker-owned session does not work reliably (no loopback ports, vendor TLS and CORS).

**Decision.** Vault accounts are user-global credentials stored as AES-GCM ciphertext in D1. The browser generates an EncryptionKey, seals Vendor login or paste plaintext, and sends only ciphertext to the Worker. Model slots (account, model, effort, fast, label, default order) are the configuration unit and the runtime fallback queue. Each enabled repo may allowlist and reorder slots. On Wake, the Home Action fetches a Runtime pack of sealed accounts plus prefs (ADR-0023) and decrypts with the Home repo `HAKASEBOT_ENCRYPTION_KEY` Actions secret. The browser writes that secret. The Worker never receives the EncryptionKey.

Accounts have no runtime order. On auth-like failure, the job tries the next queued slot, which may be a different Engine. Catalog list calls use Deployment API keys (ADR-0032), not vault plaintext. Loss of the EncryptionKey without an export is rotate, then re-add accounts.

The Models tab shows the fast checkbox when the catalog row has `supportsFast`. If the vendor omitted it, the form uses `engineSupportsFast` (claude, codex, cursor). Custom string keeps that engine default.

**Rejected.** Holding EncryptionKey or vault plaintext on the Worker. A central Engine-secret proxy on the Deployment. Account-only fallback (users pick model slots, not accounts). Writing credential vault and model queue as extra Home Actions secrets (the pack already carries them).
