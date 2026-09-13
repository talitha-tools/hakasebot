import type { EngineKind } from "@hakasebot/core/domain.ts";
import { catalogModel, modelCatalog } from "@hakasebot/core/domain.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import {
	CATALOG_FRESH_MS,
	catalogKvKey,
	clearCachedCatalogs,
	parseCachedCatalog,
	readCachedModelCatalog,
} from "#/catalog-cache.ts";
import type { CatalogKv } from "#/catalog-cache.ts";
import { m as msg } from "#/paraglide/messages.js";

function memoryKv(init: Record<string, string> = {}): CatalogKv & {
	store: Map<string, string>;
} {
	const store = new Map(Object.entries(init));
	return {
		get: async (key) => {
			await Promise.resolve();
			return store.get(key);
		},
		put: async (key, value) => {
			await Promise.resolve();
			store.set(key, value);
		},
		delete: async (key) => {
			await Promise.resolve();
			store.delete(key);
		},
		store,
	};
}

function claudeCatalog() {
	const model = must(
		catalogModel({ displayName: "Claude Opus 5", id: "claude-opus-5" }),
	);
	return must(modelCatalog({ engine: "claude", models: [model] }));
}

function requireStored(
	kv: { store: Map<string, string> },
	engine: EngineKind,
): string {
	const raw = kv.store.get(catalogKvKey(engine));
	if (raw === undefined) {
		throw new Error(`missing cached catalog for ${engine}`);
	}
	return raw;
}

test("miss fetches, stores, and returns the catalog", async () => {
	const kv = memoryKv();
	const catalog = must(
		await readCachedModelCatalog({
			engine: "claude",
			fetchImpl: () =>
				Response.json({
					data: [
						{
							display_name: "Claude Opus 5",
							id: "claude-opus-5",
							type: "model",
						},
					],
				}),
			keys: { anthropic: "sk-ant-test" },
			kv,
			now: 1000,
			schedule: () => {
				throw new Error("fresh miss must not schedule");
			},
		}),
	);
	expect(catalog.models[0]?.id).toBe("claude-opus-5");
	const stored = must(parseCachedCatalog(requireStored(kv, "claude")));
	expect(stored.fetchedAt).toBe(1000);
});

test("fresh hit returns kv without fetching", async () => {
	const catalog = claudeCatalog();
	const kv = memoryKv({
		[catalogKvKey("claude")]: JSON.stringify({
			catalog,
			fetchedAt: 1000,
		}),
	});
	const listed = must(
		await readCachedModelCatalog({
			engine: "claude",
			fetchImpl: () => {
				throw new Error("fresh hit must not fetch");
			},
			keys: { anthropic: "sk-ant-test" },
			kv,
			now: 1000 + CATALOG_FRESH_MS - 1,
			schedule: () => {
				throw new Error("fresh hit must not schedule");
			},
		}),
	);
	expect(listed.models[0]?.id).toBe("claude-opus-5");
});

test("stale hit returns kv and schedules a refresh", async () => {
	const catalog = claudeCatalog();
	const kv = memoryKv({
		[catalogKvKey("claude")]: JSON.stringify({
			catalog,
			fetchedAt: 1000,
		}),
	});
	const scheduled: Promise<unknown>[] = [];
	const listed = must(
		await readCachedModelCatalog({
			engine: "claude",
			fetchImpl: () =>
				Response.json({
					data: [
						{
							display_name: "Claude Sonnet 5",
							id: "claude-sonnet-5",
							type: "model",
						},
					],
				}),
			keys: { anthropic: "sk-ant-test" },
			kv,
			now: 1000 + CATALOG_FRESH_MS,
			schedule: (work) => {
				scheduled.push(work);
			},
		}),
	);
	expect(listed.models[0]?.id).toBe("claude-opus-5");
	expect(scheduled).toHaveLength(1);
	await scheduled[0];
	const stored = must(parseCachedCatalog(requireStored(kv, "claude")));
	expect(stored.catalog.models[0]?.id).toBe("claude-sonnet-5");
});

test("missing key is invalid without writing kv", async () => {
	const kv = memoryKv();
	const result = await readCachedModelCatalog({
		engine: "codex",
		fetchImpl: () => {
			throw new Error("missing key must not fetch");
		},
		keys: {},
		kv,
		now: 1,
		schedule: () => {
			throw new Error("missing key must not schedule");
		},
	});
	expect(result).toEqual({
		kind: "invalid",
		message: msg.catalog_api_key_missing({ engine: "codex" }),
	});
	expect(kv.store.size).toBe(0);
});

test("clear deletes engine keys and is idempotent", async () => {
	const kv = memoryKv({
		[catalogKvKey("claude")]: "claude-cache",
		[catalogKvKey("codex")]: "codex-cache",
		"junk:unrelated": "keep-me",
	});
	await clearCachedCatalogs(kv);
	expect(kv.store.has(catalogKvKey("claude"))).toBe(false);
	expect(kv.store.has(catalogKvKey("codex"))).toBe(false);
	expect(kv.store.get("junk:unrelated")).toBe("keep-me");
	await clearCachedCatalogs(kv);
	expect(kv.store.get("junk:unrelated")).toBe("keep-me");
	expect(kv.store.size).toBe(1);
});
