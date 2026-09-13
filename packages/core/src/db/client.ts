import { drizzle } from "drizzle-orm/d1";
import type { AnyD1Database } from "drizzle-orm/d1";

import { schema } from "./schema.ts";
import type { D1DatabaseLike } from "./types.ts";

export function createAppDb(d1: D1DatabaseLike) {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- drizzle-orm/d1 wants Cloudflare's D1Database; we only call prepare/batch
	return drizzle(d1 as unknown as AnyD1Database, { schema });
}

export type AppDb = ReturnType<typeof createAppDb>;
