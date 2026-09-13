# D1 access goes through Drizzle; schema is one migration

Prefs, vault, claims, and wake rows live in D1. Handwritten `prepare`/`bind` strings make tests fake D1 by matching those strings.

**Decision.** `drizzle-orm` against the D1 binding. Tables live in `packages/core/src/db/schema.ts`. Wrangler still applies SQL; Drizzle Kit generates later diffs. Auth stays cookie-only (no better-auth Drizzle adapter, no session table).

The launch schema is `apps/web/migrations/0001_init.sql`, the current schema in one file. Do not generate over `0001_init.sql`. Do not switch this tree to drizzle-orm v1 / `drizzle-orm/zod`.

Row reads of a table go through `drizzle-zod` `createSelectSchema` at the store boundary (`packages/core/src/db/zod.ts`). That covers shape, nullability, and CHECK-backed enums (`engine`, `effort`). Webhook `outcome` is a drizzle/zod enum without a SQL CHECK so a corrupt stored value can still be read and rejected. Joins that are not a table (last-wakes) use a hand zod object. Policy columns (`wake_mode`, `auto_authors`, `auto_branches`) stay `ParseResult` parsers so corrupt-row tests still work. Insert schemas are unused: writes already come from parsed domain values. Host-console health still counts tables on raw D1. `createAppDb` asserts the prepare/batch duck type into drizzle-orm/d1's Cloudflare client type. Drizzle Kit is wired (`db:generate`).

**Rejected.** Keep string SQL and only add Drizzle types. Kysely. Better-auth's Drizzle adapter for Lab sessions.
