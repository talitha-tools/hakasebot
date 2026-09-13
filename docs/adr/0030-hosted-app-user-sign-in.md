# Lab sign-in is the Hosted bot App

Lab login and the Bot must be one GitHub registration. Two products mean two blast radii and two permission stories.

**Decision.** Lab sign-in is user-to-server OAuth on the Hosted bot App (Client ID, Client secret, redirect URI, Email addresses read). One Hosted bot App registration. Reviews still post as the Bot. Home bootstrap and browser secret writes still act as the User. Env is `HOSTED_APP_CLIENT_ID` / `HOSTED_APP_CLIENT_SECRET`. The Client secret is not the PEM.

The Hosted bot App registration is fat (Administration, Contents write, Workflows) so a User token can create the Home repo and commit the dispatcher. Installation tokens stay skinny by **required** permission subset at mint time. GitHub will still honour a fat mint if that subset is omitted; the control is code, not the permission picker.

Install and sign-in stay separate moments. Redirect URI is `{VITE_LAB_URL}/api/auth/callback/github`. Do not tick Request user authorization during installation. Do not enable Device Flow. The Lab sign-in button is the authorize URL; the Repos tab CTA is still `https://github.com/apps/<slug>/installations/new`. better-auth's GitHub provider must not request `repo` / `workflow` scopes.

## Hosted bot App permissions

Repository:

| Permission     | Access         | Why                                                               |
| -------------- | -------------- | ----------------------------------------------------------------- |
| Administration | Read and write | `POST /user/repos` (User token only). `PATCH` Home to public.     |
| Contents       | Read and write | Commit `.github/workflows/home-review.yml` (needs Workflows too). |
| Workflows      | Read and write | Required to write files under `.github/workflows/`.               |
| Actions        | Read and write | Actions secrets, `workflow_dispatch`.                             |
| Issues         | Read and write | Progress comments.                                                |
| Pull requests  | Read and write | Posted reviews.                                                   |
| Metadata       | Read-only      | GitHub sets this.                                                 |

Account: Email addresses Read-only (better-auth Hosted bot App profile). Organization permissions stay No access.

Installation CTA copy has to say the fat grants exist so Lab can stand up Home as the User, not so the Bot can rewrite consumer repos.

## Installation token subset

`POST /app/installations/{id}/access_tokens` accepts a `permissions` body that is a subset of the Hosted bot App's grants. `mintInstallationToken` takes that body as **required**. The only legal mint for Wake, dispatch, and posting is:

```ts
{
  actions: "write",
  contents: "read",
  issues: "write",
  metadata: "read",
  pull_requests: "write",
}
```

Never mint Administration, Contents write, or Workflows on an installation token. Tests assert the mint body. Callers that create repos, write workflow files, or write Actions secrets keep taking a User token (`GithubUserToken`).

A leaked PEM can still request a fat token. Same class of failure as any GitHub App that has those permissions. Accepted.

## Home bootstrap order

User-to-server `POST /user/repos` does not need the Hosted bot App installed (Administration plus User token). Writing the dispatcher and Actions secrets does: User tokens only reach repositories both the User and the installation can access.

1. Sign in (User token). Hosted bot App install is not required for identity.
2. Create or find the public Home repo (User token).
3. Ensure the Hosted bot App covers that repo. All-repositories on the User account covers a newly created Home. Selected-only: add Home to the installation (`PUT /user/installations/{id}/repositories/{repo_id}`) or send the User through the configure CTA.
4. Write the dispatcher and Hosted bot App Actions secrets (User token).
5. Record `installation_id`. Browser EncryptionKey sync is User token, Home only (ADR-0003).

## Session

User tokens expire in eight hours; refresh tokens last about six months. The sealed-cookie session must refresh. `github-session` is the seam: callers still receive a live User token; refresh and cookie rewrite stay inside. If refresh fails, sign in again.

Localhost `LAB_DEV_USER` (ADR-0012) still applies; `LAB_DEV_GITHUB_TOKEN` remains a PAT for Agent writes. D1 stays keyed by GitHub user id.

The picker lists User-visible repos via `GET /user/installations` plus `GET /user/installations/{id}/repositories` (ADR-0025). `GET /user/repos` remains the fallback when the Hosted bot App is unset.

**Rejected.** A separate OAuth App for Lab login. Two GitHub App registrations (fat login App plus skinny Bot App). Identity-only App OAuth with installation tokens for Home writes (`POST /user/repos` is User token only; EncryptionKey sync must stay in the browser with a User token). Fat installation tokens (the Bot could rewrite consumer contents and workflows).
