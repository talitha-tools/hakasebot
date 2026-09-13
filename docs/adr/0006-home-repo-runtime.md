# Review runtime lives on the User's Home repo

The Hosted bot App webhook wakes the web app. The Worker does not spawn Engines. Consumer orgs must not need Actions enabled or spend minutes.

**Decision.** Lab bootstraps one public Home repo on the User's account (ADR-0013). That repo holds the dispatcher workflow and Actions secrets (EncryptionKey plus Hosted bot App id and PEM). Consumer repos keep the Hosted bot App and nothing else. No consumer YAML. No consumer secrets. The Hosted bot App must cover the Home repo so the Worker can dispatch.

On Wake, the Worker verifies HMAC, posts or reuses a progress comment, dispatches the Home workflow, polls for the run URL after GitHub's 204, and patches the comment. It does not spawn Engines. The job fetches a Runtime pack (ADR-0023), clones the consumer at `head_sha` with an installation token minted from Hosted bot App secrets, runs ReviewRuntime, and patches the terminal outcome. The Action parses Home `workflow_dispatch` only. Claim recheck is `GET /api/claim-status`. The Home dispatcher timestamp on `enabled_repos` is `home_at`.

**Wake.** `WakeKey` is `repo-id#pr@sha` for PR events and `repo-id#pr!commentId` for mention/fix. Duplicate deliveries insert-or-ignore. Home concurrency `home-{target_repo}-{pull}` cancels the stale run.

**Dispatch inputs.** `target_repo`, `consumer_repo_id`, `pull_number`, `head_sha`, `installation_id`, `comment_id`, `dispatch_id`, `plan`. No token in inputs (they show in the Actions UI). The job mints an installation token from Hosted bot App secrets. `mintInstallationToken` parses GitHub's `expires_at` into an `InstallationGrant`. A per-job `BotAuth` lease remints when less than five minutes remain.

**Progress comment.** One issue comment per PR with a hidden wake marker. Worker owns queued/started/dead. Home job owns the terminal outcome.

**Claim.** `repo_routes` is keyed on `(repo_owner, repo_name)`. Enable is insert-or-ignore then read-back. A second User gets `held-by-other` with no identity in the API. Disable releases the claim if this User holds it. `repo_routes.generation` increments on claim. Dispatch carries it. Before the terminal progress patch and before `reconcileAndPost`, the Home job rechecks fail-open. A mismatch means the claim moved; the old job does not post.

**Rejected.** A consumer `runs-on` stub that HTTP-pings the Worker (still bills the consumer). Checks API as the progress surface (drops mention/fix and the requested comment link). Passing a consumer installation token as a dispatch input. Engines on the Worker (ADR-0001). More than one Home repo per User.
