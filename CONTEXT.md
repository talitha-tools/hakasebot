# Hakasebot

A coding-agent review product for GitHub pull requests. The human installs it on a repo; agents post native reviews.

## Language

**User**:
The person who enables hakasebot on a repository. Self-serve target is any repo owner; near-term bar is one maintainer and a handful of their own repos.
_Avoid_: Installer, customer, operator (unless meaning the person who deploys the web app)

**Web app**:
The surface that configures hakasebot for a User (auth, vault accounts, model slots, per-repo install). Today this is the Cloudflare Lab Dashboard at `/`.
_Avoid_: Control plane, App (alone), website (alone)

**Dashboard**:
The signed-in web app shell after the encryption-key gate. Tabs cover onboarding checklist, vault accounts, model slots, enabled repos with in-row install, and key rotation.
_Avoid_: Lab wizard, setup funnel

**Review runtime**:
Where the coding CLI runs and the GitHub review is posted. GitHub Actions on the Home repo, not the web app and not the consumer repo.
_Avoid_: Worker, server, backend

**Home repo**:
Public GitHub repository on the User's account that hosts the review runtime (dispatcher workflow and Actions secrets). Issues, wiki, projects, discussions, and pull requests are off. Prefs and sealed vault live in D1, not in this repo.
_Avoid_: Prefs repo, sidecar repo, installer repo (alone)

**Runtime pack**:
Prefs and sealed vault ciphertext the Review runtime fetches from the web app at job start for one Wake. Built from D1. EncryptionKey is not in the pack; it stays an Actions secret on the Home repo.
_Avoid_: prefs.json, vault.json (as git files), git SoT

**Wake**:
Hosted bot App webhook delivery that asks the web app to start a review.
_Avoid_: stub ping (as the default path)

**Wake mode**:
Per-repo setting for which Wakes start a review. `auto` runs on pull request opened/synchronize/reopened/ready_for_review and on mention phrases. `mention-only` runs on mention and fix phrases only.
_Avoid_: Trigger policy (alone), quiet mode, manual mode

**Auto authors**:
Per-repo setting for whose pull requests Auto Wakes start a review. `you` (default) runs only for the User's own pull requests. `friends` runs for OWNER, MEMBER, and COLLABORATOR. `everyone` runs for every human author. Skip logins never Auto, even if they match the scope. Mention and fix phrases still run. Bot senders stay ignored at parse. The Worker reads it from D1 on the enabled row.
_Avoid_: Reviewer allowlist (ambiguous with Bot), trigger policy (that's Wake mode), author filter (say Auto authors)

**Auto review cadence**:
Per-repo setting for how often Auto Wakes start a review on push. `every-push` (default) dispatches on each pull request head change. `once-per-pr` dispatches at most one auto review per pull request; `failed`, `cancelled`, and `superseded` wake rows do not count, so a later auto event may try again. Mention and fix phrases still run. The Worker reads it from D1 on the enabled row.
_Avoid_: Review frequency (alone), re-review policy

**Incremental review**:
Follow-up review on a pull request that already has a non-dismissed posted review on an older commit. The Review runtime diffs since that review's commit, passes the prior review body as context, and expects findings only on the incremental diff. Force-push or missing ancestry falls back to full merge-base diff. Distinct from skip-unchanged (same head SHA).
_Avoid_: Delta review (alone), partial review

**Auto branches**:
Per-repo setting for which target branches Auto Wakes start a review. `default` (default) runs only when the pull request targets the repository default branch. `all` runs for every pull request target branch. `listed` runs only for branch names or globs in the list. Skip branches never Auto, even if they match the scope. Mention and fix phrases still run. The Worker reads it from D1 on the enabled row.
_Avoid_: Branch filter (say Auto branches), base branch policy (alone)

**Repo setting defaults**:
Account-wide defaults for the main per-repo options (Wake mode, Auto authors scope, Auto branches scope, Auto review cadence). Copied onto a consumer repo when it is enabled. Skip lists, branch lists, and Review instructions stay per-repo only. Changing defaults does not rewrite existing enabled rows.
_Avoid_: Global wake switch, account prefs (too broad), default string fields

**Draft pull request**:
A GitHub pull request still marked draft. Auto Wakes skip it. Mention and fix phrases still run. `ready_for_review` is the auto Wake that starts once the draft flag drops.
_Avoid_: WIP (as the skip rule)

**Last Wake**:
The most recent Wake row for one enabled consumer repo. Dashboard shows its status, time, and Home run URL when present.
_Avoid_: Last Actions run (ambiguous with consumer workflows), host aggregate counts

**Dispatch**:
Web app starting a workflow_dispatch run on the Home repo after a Wake.
_Avoid_: workflow_call from the consumer

**Progress comment**:
Issue comment on the consumer pull request that carries the Home repo Actions run URL and is updated when the run finishes.
_Avoid_: Check run (as the default progress surface)

**Repo claim**:
Exclusive right for one User to receive Wakes for a consumer repository. Release then claim is the transfer. Distinct from the Dashboard enabled list. Disable in Lab, uninstall of the Hosted bot App, and Lab account deletion all release it. On enable, if another User still holds the claim, Lab checks they still have write access on the consumer repo; if not, their claim and enabled row are cleared so the new User can claim.
_Avoid_: Last bot wins, shared enable, two homes for one consumer

**App uninstall**:
GitHub removing the Hosted bot App from an account or from selected repositories. Releases the Repo claim for those consumer repos and clears Home installation id when the Home repo loses the App. Distinct from Disable in Lab and from revoking User authorization.
_Avoid_: Disable (the Dashboard action), revoke (User authorization)

**Action**:
The composite GitHub Action published from this repo that the Home dispatcher invokes (`uses:`).
_Avoid_: Workflow, app

**Lab**:
The Cloudflare web app at `/`. After sign-in and the encryption-key gate, the Dashboard manages vault accounts, model slots, Home repo bootstrap, and per-repo install (Hosted bot App, then enable). Not a linear wizard and not a YAML copy-paste machine.
_Avoid_: Setup site (prefer Lab or Dashboard when meaning the web app)

**Per-repo install**:
Finishing one enabled repository after the Hosted bot App already covers it. Order is bot confirm, then browser EncryptionKey sync to the Home repo. Distinct from user-global vault accounts, model slots, Home repo bootstrap, and App install/configure.
_Avoid_: Lab wizard, full-page funnel, per-row App install CTA

**Repo picker**:
Repos tab UI that lists repositories the Hosted bot App installation grants and the User's GitHub session can see (search/filter). The App install/configure CTA stays at the top of the tab. Free-typed owner/name is fallback only.
_Avoid_: Manual repo entry (as the primary path), wizard repo step (alone), listing every session repo

**Model catalog**:
Deployment-wide vendor list for one Engine, fetched with Deployment API keys from the vendor's official models endpoint and cached. Source of coding-model ids plus optional effort, context window, and fast-mode flags. Custom string is the fallback when the list is missing or the id is unpublished.
_Avoid_: Stored model-id table, operator-curated list, vault-credential catalog probe, probe on account save, frozen ENGINE_OPTIONS defaults

**Home bootstrap**:
How the Home repo appears on the User's account. Lab creates the public repo, turns off GitHub social features (issues, wiki, projects, discussions, pull requests), and commits the dispatcher workflow. Browser writes the EncryptionKey Actions secret. The Hosted bot App must cover that repo.
_Avoid_: YAML paste

**Deployment**:
One running web-app instance (for example a Cloudflare Worker). Forks and operators configure it with Deployment config.
_Avoid_: Hosting, production (alone)

**Deployment config**:
Env and secrets on a Deployment that forks may change without code edits. Includes Hosted bot App credentials, Action ref, and public Lab URL / branding hooks.
_Avoid_: Hardcoded talitha-tools refs

**Host console**:
The operator-only backend manager at `/host` for the person who deploys the web-app Worker. Deployment status, D1 health, aggregate usage, and Model catalog cache clear. Gated by `HOST_CONSOLE_TOKEN`, not Lab sign-in. Distinct from the User Dashboard.
_Avoid_: Admin panel (ambiguous), operator dashboard (collides with User Dashboard)

**Hosted bot App**:
The GitHub App on the Deployment. Reviews post as that App. Lab sign-in is the same App acting as the User, not a second GitHub registration. A fork changes which App by changing Deployment config, not by forking product logic.
_Avoid_: GitHub App (alone), bot App (alone), Hosted poster App, OAuth App (as Lab login)

**User token**:
GitHub App user-to-server token from Lab sign-in. Lab uses it to act as the User (Home bootstrap, browser Actions secret writes). Distinct from an installation token, which acts as the Bot.
_Avoid_: OAuth App token, gho\_ token, session PAT (`LAB_DEV_GITHUB_TOKEN` is the localhost exception)

**User authorization**:
The User granting the Hosted bot App permission to act as them in Lab. Distinct from App install, which grants the Bot repository access. Revoke at GitHub ends Lab sign-in; uninstall stops Wakes and posting.
_Avoid_: OAuth App authorize, login grant

**Bot**:
The GitHub identity that signs the posted review. Default product path is the Hosted bot App. Lab install starts by installing that App on the repo.
_Avoid_: Poster, reviewer identity, actions-bot (as the default path)

**Engine**:
Which coding CLI runs a pass (claude, codex, grok, cursor, antigravity), plus its model and effort.
_Avoid_: Brain, agent, model (alone)

**Engine connection**:
The User's linked vendor credential for an Engine, stored as a **Vault account** (Vendor login or paste, then sealed in D1). Model slots reference vault accounts; model strings come from the live **Model catalog** (or a custom string). Install is incomplete until Home bootstrap and browser EncryptionKey sync to the Home repo finish.
_Avoid_: OAuth-first connect, linear wizard connect step

**Vendor login**:
In-Lab OAuth (or device-code) flow that mints the same plaintext a User would paste into a Vault account, then the existing seal path locks it. Claude, Codex, Grok, and Antigravity use Login only (no manual paste box). Cursor stays paste-only. Distinct from GitHub Lab sign-in.
_Avoid_: Engine OAuth connect, native OAuth (alone), cliproxy login (implementation analogy)

**Vault account**:
A user-global vendor credential (Claude token, auth.json, etc.) stored as ciphertext in D1, whether the plaintext came from paste or Vendor login. Decrypted in the browser with the User's encryption key. The Worker does not see vault plaintext. Review runtime fetches sealed accounts in the Runtime pack and decrypts with the Home repo EncryptionKey Actions secret.
_Avoid_: Engine secret (for the vault row), login artifact (alone)

**Encryption key**:
Per-GitHub-user encryption key generated in the browser. Never sent to the product server. Written to Home repo Actions secrets during browser-only finish sync. Settings can re-export the key already in this browser. A lost key with existing Vault accounts is the import gate; recovery there is rotate.
_Avoid_: VaultKey, Deployment master key, session cookie

**Account deletion**:
User-initiated wipe of every product-held row for that User, plus clearing the browser Encryption key and signing out. Distinct from deleting one Vault account. The product does not change GitHub; after wipe, Settings reminds the User to remove the Home repo and uninstall the Hosted bot App themselves (ADR-0026).
_Avoid_: Delete vault account (one credential), disable repo, App uninstall, key rotate, sign-out alone

**Review instructions**:
User-written guidance the review runtime adds to the Engine prompt. Dashboard prompt and path ignore live per enabled repo. `.hakasebot.md` at the consumer repo root is extra, repo-owned text (same stem as the review HTML marker).
_Avoid_: System prompt (alone), policy file, reviewer persona

**Report check**:
A deterministic filter the Review runtime runs on an Engine report after schema validation (ADR-0018, ADR-0019). Drops findings that are unpostable or that match the repo ignore globs. Distinct from the Engine prompt and from Zod wire-shape validation.
_Avoid_: Script (alone), linter, output verification (that's the schema step)

**Engine script**:
A POSIX command the Review runtime materializes in job HOME; the Engine's shell may spawn only these. Distinct from Report checks, which run in the Review runtime after the pass.
_Avoid_: Script (alone), helper (alone), linter

**Model slot**:
A user-global review configuration: one vault account + model + optional effort + optional fast flag + similar-model option + label. Default order is user-wide; each repo may allowlist and reorder slots.
_Avoid_: Engine connection (for the slot), frozen model default

**Similar-model option**:
Per Model slot boolean, on by default. When the stored model id is absent from the Model catalog in the Runtime pack and a same-family successor exists, the review runtime uses that successor. Off means the Action fails and the progress comment states why. A missing catalog runs the stored id.
_Avoid_: Fallback model, auto-upgrade, alias, similar-model fallback (say similar-model option)

**Engine secret**:
Vendor auth material in the review runtime, resolved from the credential vault via a model queue entry.
_Avoid_: Deployment-held engine credentials, central brain
