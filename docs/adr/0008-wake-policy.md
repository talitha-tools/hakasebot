# Wake mode is per repo; drafts never auto-review

Auto Wakes on every pull_request opened/synchronize/reopened/ready_for_review burn minutes on draft pull requests and on noisy repos where the User only wanted a mention.

**Decision.** Auto Wakes ignore draft pull requests. Mention and fix phrases still run on drafts. Per enabled repo, Wake mode is `auto` (default) or `mention-only`. `mention-only` ignores pull_request plans and still dispatches mention and fix. The Worker reads Wake mode from D1 on the enabled row.

A global switch that forces every enabled repo was rejected: the near-term bar is a handful of own repos, and only some of them are noisy. Account-wide Repo setting defaults (ADR-0024) seed new enables only. A third "off" mode was rejected: disable already stops Wakes.
