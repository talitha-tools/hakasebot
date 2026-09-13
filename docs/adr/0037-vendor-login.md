# Vendor login mints vault paste plaintext

Native Lab OAuth as a Worker-owned session is unreliable on Workers (no loopback ports, vendor TLS/CORS). Vault paste is the store. Users still want a Login button like the desktop vendor CLIs.

**Decision.** Vendor login is a paste mint, not a second account store. For Claude, Codex, Grok, and Antigravity the Accounts tab runs a vendor-CLI-style flow (PKCE with callback-URL paste, or device code) and does not offer a manual credential paste box. The flow fills the existing credential draft; Lock it in still runs `parseCredentialPaste` → browser seal → D1 ciphertext. Cursor stays paste-only. GitHub Lab sign-in stays better-auth on `/api/auth/*` and is never reused for vendor tokens.

PKCE verifiers and device codes live in browser `sessionStorage` (short TTL, one attempt per tab). Token HTTP tries the browser first when a CORS preflight can fail without burning a single-use code; otherwise a signed-in Worker relay forwards to an allowlisted vendor URL and returns the body without parsing or persisting it. Claude uses Anthropic's `code=true` authorize path and only accepts long-lived tokens that fit bare `ClaudeOauthToken`. Antigravity reuses the published desktop client already in `antigravity-oauth.ts`.

The relay briefly sees vendor token bytes in memory on some engines; never D1, never logged. Claude Login may be unavailable in some Deployments (CORS or Worker TLS fingerprint); those Users cannot mint Claude through Accounts until the exchange works.

**Rejected.** Worker-owned OAuth session tables / KV / Durable Objects for verifiers. Registering the Lab origin as `redirect_uri` or shipping new vendor OAuth apps. Auto-sealing on login success (second persist path). utls / JA3 spoofing on Workers for Anthropic. A manual paste box next to Login for OAuth engines (dual entry paths on the same form).
