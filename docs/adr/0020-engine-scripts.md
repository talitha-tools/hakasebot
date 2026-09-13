# Engine shell is Engine scripts plus vendor allowlists

Engine CLIs auto-approve almost every tool (`--yolo`, `--full-auto`, `--dangerously-skip-permissions`). Report checks (ADR-0019) only filter the posted report, so a pass can still run arbitrary shell before that.

**Decision.** After creating job HOME, the Review runtime writes Engine scripts (`review-merge-base`, `review-diff`) into `$HOME/bin`, prepends that directory to PATH, and names the absolute paths in the prompt. Where a vendor CLI has an allowlist, drop blanket auto-approve and permit only those scripts (plus read tools, and write of `review-report.json`; mention/fix also get workspace edit/write):

- claude: `--permission-mode dontAsk` and `permissions.allow` / `--allowedTools` for Read, Grep, Glob, `Write` of the report file, `Bash(<script>:*)`, and Edit/Write on mention/fix
- cursor: `--sandbox enabled --trust`; `--force` only on mention/fix
- codex: drop `--full-auto`; `--sandbox workspace-write --ask-for-approval never` with job HOME as a writable root and network off (no per-command allowlist)
- grok, antigravity: keep vendor CI auto-approve; still materialize the scripts

Blanket skip-permissions as the CI default was rejected. Putting Report checks inside an Engine script was rejected: they stay in the Review runtime after Zod. Filtering the consumer checkout (ADR-0009) stays rejected.

PATH is not a sandbox: engines without a command allowlist can still invoke `/usr/bin/curl`. Claude `dontAsk` still auto-approves read-only Bash outside the allowlist (vendor). Shallow consumer clones may make `review-merge-base` fall back to HEAD.
