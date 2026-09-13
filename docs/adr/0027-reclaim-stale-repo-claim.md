# Enable reclaims when the prior holder lost write access

Repo claims are exclusive. A second User who tries to enable would otherwise get `held-by-other` forever if the first User never disables and never uninstalls, including when they delete their GitHub account outside Lab or lose push on the consumer repo. Account deletion in Lab (ADR-0026) clears claims only when the User uses that flow.

**Decision.** On enable, when the consumer repo is already claimed by someone else, Lab checks whether that holder still has write access (`push` or `admin`) on the repo, using the enabling User's GitHub session token. Resolve the holder via `GET /user/{id}` then `GET /repos/{owner}/{repo}/collaborators/{login}/permission`. No write access, missing user, or missing collaborator: release their Repo claim, disable their enabled row, then claim for the enabling User. Holder still has write: `held-by-other`. Lookup or permission API errors keep the block (do not steal on a flaky check).

**Rejected.** Periodic sweep of all claims (enable is the moment someone cares). Trusting App uninstall alone (ADR-0010; misses account wipe and membership loss). Using the Hosted bot App installation token for the check (extra wiring on enable; session token is enough when the picker already showed the repo). Soft-warn without reclaim.
