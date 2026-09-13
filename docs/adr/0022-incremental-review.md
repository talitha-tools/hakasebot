# Follow-up reviews diff since the last posted review

Auto review cadence (ADR-0021) can fire more than once per pull request. Every pass using `review-diff` from merge-base to `HEAD` would re-read the whole pull and repeat findings.

**Decision.** When `plan.kind === "review"` and the pull already has a non-dismissed posted review on an older commit, the Review runtime switches to incremental mode:

- Fixed point is that review's `commit_id`, not merge-base.
- Engine scripts include `review-diff-since` (`git diff $REVIEW_SINCE_SHA HEAD`).
- The prompt carries the prior review body (marker stripped) as context only; findings must target the incremental diff.
- The runtime shallow-fetches the since commit into the consumer checkout before engines run.
- If the since commit is not an ancestor of head (force-push), fall back to full merge-base diff with no prior context.

Mention and fix stay single-pass full checkout. Marker shape is unchanged.

Folding incremental scope into wake cadence was rejected: cadence is when to wake; diff scope is how to review once awake. Filtering the checkout was rejected (ADR-0009).
