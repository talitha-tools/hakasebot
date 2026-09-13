# JWT iss is the Hosted bot App client ID

GitHub accepts the App client ID as JWT `iss` and recommends it over the numeric App ID. Lab sign-in already holds `HOSTED_APP_CLIENT_ID`.

**Decision.** Mint App JWTs with that client ID. There is no `HOSTED_APP_ID`. Match `GET /user/installations` by `app_slug` against `HOSTED_APP_SLUG`, not by numeric `app_id`.

The Client ID is not a secret. GitHub documents that. It stays a Worker var with `HOSTED_APP_SLUG`. Home Action input `github_app_id` and secret `HAKASEBOT_APP_ID` keep those names; the value they hold is the client ID.

**Rejected.** A second numeric App ID env for JWT and matching. Resolving numeric id via `GET /app` and matching `app_id` (extra round trip for a field GitHub is steering away from).
