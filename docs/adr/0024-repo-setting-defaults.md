# Account-wide defaults seed new enabled repos

Per-repo Wake mode, Auto authors, Auto branches, and Auto review cadence each need a value on enable. Users who want quieter or louder defaults on every new repo should not re-tune each row. A global switch that forces every enabled repo was rejected (ADR-0008, ADR-0015, ADR-0021); a seed value for new enables was not.

**Decision.** Store account-wide Repo setting defaults for the main options only: Wake mode, Auto authors scope, Auto branches scope, and Auto review cadence. Skip logins, branch lists, skip branches, review prompt, and ignore paths stay per-repo and are never part of the defaults row. Enable copies the account defaults onto the new enabled row; changing defaults does not rewrite existing rows. Missing account row falls back to product defaults (`auto`, `you`, `default`, `every-push`). Worker Wake path still reads only the enabled row.
