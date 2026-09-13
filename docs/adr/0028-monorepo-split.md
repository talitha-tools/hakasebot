# Monorepo split: web app, Action, core

One flat `src/` would mix the Cloudflare web app and the GitHub Action runtime. The Action module graph would eagerly evaluate web-only code (`env.ts` validating `BETTER_AUTH_SECRET`, the D1 vault store pulled in for one pure helper). String-glob lint bans fail open after a rename.

**Decision.** Bun workspaces. `apps/web` is the TanStack Start worker (Lab, Dashboard, Host console, wake webhook) and owns `env.ts`, `deployment-config.ts`, `lib/`, `migrations/`, `wrangler.jsonc`. `packages/action` is the review runtime behind root `action.yml`. `packages/core` is the shared domain: `domain.ts`, review parse, vault crypto/domain/store, wake domain, Home prefs and Runtime pack, the GitHub REST client, the Model catalog stack. `packages/test-kit` holds cross-package test helpers, fixtures, and the Bun polyfill.

`action.yml` stays at the repo root so `talitha-tools/hakasebot@main` is the published Action. It runs `bun install --frozen-lockfile --production --filter '@hakasebot/action'`: workspace imports resolve through the install link (Bun auto-install cannot link `workspace:` deps). Every Action runtime dependency has to sit in `dependencies`, never `devDependencies`, because the graph must stay free of dynamic imports. Within a package, `#/` maps to that package's `src/`, declared twice on purpose: Bun resolves it from tsconfig `paths`, Vitest from the package.json `imports` map. Across packages, imports use `@hakasebot/core/...`. `apps/web` declares only `@hakasebot/core`, so web-importing-Action is unrepresentable on disk.

Package boundaries that lint cannot express are structural (ADR-0029).
