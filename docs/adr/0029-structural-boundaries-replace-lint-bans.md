# Structural boundaries replace oxlint restricted-import bans

String-glob `no-restricted-imports` bans fail open after any rename. Precedence between overlapping overrides is hard to follow, and every new directory needs another carve-out.

**Decision.** Each boundary is a mechanism that fails closed at build or type-check time.

- `@hakasebot/action/*`: the package declares `"exports": {}`. Nothing in the workspace imports it (only root `action.yml` executes it by file path). Bun already links only declared workspace deps, so any future import fails resolution twice over.
- `Bun.*` in web/core: those tsconfigs do not load `bun` types (`apps/web` keeps `node` for `nodejs_compat` and test IO; core keeps `types: []`). Any `Bun.*` reference is a type error under type-aware oxlint. The test-kit `sha256HmacHex` helper uses WebCrypto so web/core test programs stay Bun-free.
- `review.server.ts`, and web vault `gate.ts` / `session-key.ts` as `.client.ts`: the TanStack Start import-protection plugin denies `**/*.server.*` imports in the client build and `**/*.client.*` in the SSR build, including files resolved from workspace packages. The client can never see the review parser or the GitHub REST client. The Worker can never see the session key, so it can never decrypt, even though the pure `core/vault/crypto.ts` math stays importable everywhere (the Action decrypts with it in CI).
- `node:*` in web/core server code moved to WebCrypto and web-standard APIs, so `import/no-nodejs-modules` holds without carve-outs.

CI lint plus the build step is what makes these boundaries enforced rather than conventional. The build step exercises import protection on every PR.

Coarser than a per-directory ban list, on purpose: `review.server.ts` is importable by any server module, not just `wake/**`. The zero-knowledge property that matters, key material and decryption stay out of the Worker, is carried by the `.client.ts` suffix, not by trusting globs.
