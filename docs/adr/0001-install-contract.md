# Install is Hosted bot App, Engine connection, and Home bootstrap

Hakasebot's web app (Cloudflare Lab) configures repos. The review runtime stays on GitHub Actions. We rejected moving reviews onto Workers and rejected the Lab as a copy-paste workflow printer.

**Decision.** Install means: install the Hosted bot App (credentials from Deployment config), complete an Engine connection without sending vault plaintext to the Worker, choose a model from the live Model catalog, and bootstrap a Home repo that hosts the dispatcher. Forks re-point App credentials, Action ref, and Lab URL via Deployment config. Repo selection and model defaults are live discovery (ADR-0002), not typed names or frozen constants.

**Rejected.** Full consumer-owned workflow YAML (drifts). Deployment-owned shared Engines (ToS, cost, blast radius). Default posting as `github-actions[bot]` for self-serve (we want a product identity). Central Engine-secret proxy on the Deployment (second trust channel for no gain while runtime is Actions).
