# Auto authors is per repo; mentions still run

Wake mode is when. There is no who: every human pull request author would get an Auto Wake on `auto`. That burns minutes on friends' PRs when the User only wanted their own, or on every PR when they only wanted people with access.

**Decision.** Per enabled repo, Auto authors is `you` (default), `friends`, or `everyone`, plus optional skip logins. `you` is the User's GitHub user id on the pull request author. `friends` is GitHub `OWNER` / `MEMBER` / `COLLABORATOR`. `everyone` is every human author. Skip logins never Auto, even when they match the scope. Auto authors applies only to review plans. Mention and fix phrases still run. Bot senders stay ignored at parse. The Worker reads Auto authors from D1 on the enabled row. A corrupt Auto authors row falls back to the default so mentions still run.

Folding who into Wake mode was rejected: when and who are different axes, and the enum would explode. Allowlist-only was rejected: GitHub association and the User's GitHub user id are already on the webhook and the enabled row. Applying Auto authors to mentions was rejected for the same reason drafts still mention: an explicit ping still runs. Defaulting to everyone was rejected: Auto should start quiet; the User opens it up.
