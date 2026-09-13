# Public product name is not a secret

The product name is a public string. Cursor's commit hook blocks the value of Runtime Secrets. If public branding env lives in Runtime Secrets, writing `hakasebot` looks like leaking a secret, and agents add allowlist comments or commit the redaction placeholder.

**Decision.** Call sites write `hakasebot`. Lab headings that name the product write that string. Document title and kickers may be catalog hakase voice. Cloud Agent install must not seed public branding into `.env.local`. `VITE_SOURCE_REPO_URL`, `VITE_ACTION_REF`, and `VITE_LAB_URL` default in `apps/web/src/env.ts`. Cursor keys for `VITE_SOURCE_REPO_URL`, `VITE_ACTION_REF`, `VITE_LAB_URL`, `HOSTED_APP_SLUG`, and `HOSTED_APP_CLIENT_ID` are Environment Variables, not Runtime Secrets. Real credentials stay Runtime Secrets.

Character-array joins are rejected. Putting public branding in Runtime Secrets is rejected. Do not add secret-scanner allowlists for the product name. There is no `PRODUCT_NAME` export.
