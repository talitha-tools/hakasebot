# Antigravity is an Engine

Engine kind is the unit of CLI selection. The kinds are `claude`, `codex`, `grok`, `cursor`, and `antigravity`. Antigravity (`agy`) uses the same seam as the others: domain kind, vault credential, argv, Lab picker, Model catalog.

**Decision.** Antigravity is a first-class Engine, wired through the same seam as claude, codex, grok, and cursor.

**Antigravity.** Binary `agy`. Vault credential and model ids are the Cloud Code Assist OAuth path (ADR-0033). Argv is `agy -p <prompt> --model <model> --output-format json --json-schema <report-schema> --dangerously-skip-permissions`. Prefer `structured_output` from the JSON envelope; fall back to parsing `response`. Fast default: off.

`engineKind` remains the parse boundary. D1 `engine` CHECKs include this kind on `vault_accounts` and `model_slots`.
