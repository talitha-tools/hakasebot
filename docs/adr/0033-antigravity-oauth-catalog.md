# Antigravity OAuth vault and model scrape

`agy` reaches Cloud Code Assist (`daily-cloudcode-pa`) and a model set that is not the Gemini developer list, including Claude-backed ids. Interactive Google keyring login cannot travel through Actions, but `agy` already persists a file credential that can.

**Decision.** Vault paste is the `agy` OAuth JSON (`{ token: { access_token, refresh_token, expiry, token_type }, auth_method }`). `refresh_token` is required. Desktop `agy` stores that blob in the OS keyring (Secret Service `service=gemini`, `username=antigravity`), not under `~/.gemini/antigravity-cli/`. There is no `agy auth login` subcommand; sign-in is the TUI. `secret-tool lookup` fails on KDE because the item is `text/plain; charset=utf8` and secret-tool only accepts exact `text/plain`. Dump with python `gi.repository.Secret` (search those attributes, write `item.get_secret().get()`). The file names `jetski-standalone-oauth-token` and `antigravity-oauth-token` exist as the headless fallback when keyring save fails.

Runtime writes that blob to both filenames under `$HOME/.gemini/antigravity-cli/`, sets `GEMINI_FORCE_FILE_STORAGE=true` for `agy` builds that honor it, and does not set `GEMINI_API_KEY` or `modelProvider: "gemini"`. Actions has no keyring, so `agy` falls through to the file. `agy` refreshes the access token itself.

The Deployment Model catalog (ADR-0032) scrapes Antigravity, not Gemini. `CATALOG_ANTIGRAVITY_OAUTH` is the same token-file JSON. The Worker refreshes the access token with Google's published Antigravity desktop OAuth client, then `POST`s `/v1internal:fetchAvailableModels` on `daily-cloudcode-pa.googleapis.com` (sandbox host as fallback) with the Antigravity hub User-Agent. Internal and denylisted ids are dropped. Custom string stays the escape hatch. Fallback custom string is an Antigravity id (`gemini-3-flash`).

Host console cache clear drops `catalog:v1:antigravity`.

**Rejected.** A Gemini API key as the CI credential (it never sees Antigravity models). Vault-credential catalog probes (catalog stays Deployment-keyed). Calling Cloud Code Assist from the Action instead of spawning `agy` (the Engine is still the vendor CLI). Persisting rotated refresh tokens back into Worker secrets (Google usually returns the same refresh token; if it rotates, the operator re-pastes `CATALOG_ANTIGRAVITY_OAUTH`).
