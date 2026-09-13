# App uninstall releases the Repo claim

Disable in Lab releases the claim. If uninstalling the Hosted bot App did not, Wakes would still route to a Home that can no longer mint tokens for that consumer.

**Decision.** Persist the bot installation id on `repo_routes`. `installation_repositories` removed and `installation.deleted` release matching claims and disable those Dashboard rows. If the deleted installation is the Home repo's, clear `home_repos.installation_id`. Vault accounts stay.

Releasing without touching the enabled list was rejected: the row would look installed while Wake is dead. Waiting for the next Wake to 404 was rejected: the claim would still block another User.
