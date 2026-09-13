# Auto review cadence is per repo; cancelled and failed runs do not count

Wake mode is when. Auto authors is who. Neither says how often an automatic review should run on push. Every `synchronize` would otherwise get a distinct `WakeKey` (`owner/name#pr@sha`), so each push dispatches again. Home concurrency cancels the stale run, but the Worker still paid for the dispatch.

**Decision.** Per enabled repo, Auto review cadence is `every-push` (default) or `once-per-pr`. `every-push` uses a sha-suffixed `WakeKey`. `once-per-pr` uses `repo_id#pr` for review plans only; mention and fix keep `repo_id#pr!commentId`. The Worker reads cadence from D1 on the enabled row.

For `once-per-pr`, skip an auto review when the latest auto wake row for that consumer pull (`comment_id` null) has status `queued` or `dispatched`. `failed`, `cancelled`, and `superseded` do not satisfy once. A later auto event may dispatch again. A cancelled Home run from concurrency, a failed-to-start Worker outcome, or a failed Home job therefore does not block the one review. Home reports `failed` to the Lab wake-status endpoint when a review job fails; concurrency marks stale rows `superseded`. Mentions and fixes are unaffected.

Folding cadence into Wake mode was rejected: when, who, and how often are separate axes. A global switch that forces every enabled repo was rejected for the same reason as Wake mode (ADR-0008). Account-wide Repo setting defaults (ADR-0024) seed new enables only.
