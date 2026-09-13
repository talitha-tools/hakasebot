import type { CatalogApiKeys } from "@hakasebot/core/catalog-fetch.ts";
import type {
	EngineKind,
	ModelCatalog,
	ParseResult,
} from "@hakasebot/core/domain.ts";
import { isRecord } from "@hakasebot/core/is-record.ts";

import { env } from "#/env.ts";
import { m as msg } from "#/paraglide/messages.js";

import {
	clearCachedCatalogs,
	readCachedModelCatalog,
} from "./catalog-cache.ts";
import type { CatalogKv } from "./catalog-cache.ts";

export type CatalogCacheClear =
	| { kind: "cleared" }
	| { kind: "unavailable"; message: string };

interface CatalogKvBinding {
	get: (key: string, type?: string) => Promise<unknown>;
	put: (key: string, value: string) => Promise<void>;
	delete: (key: string) => Promise<void>;
}

function isCatalogKvBinding(value: unknown): value is CatalogKvBinding {
	return (
		isRecord(value) &&
		typeof value["get"] === "function" &&
		typeof value["put"] === "function" &&
		typeof value["delete"] === "function"
	);
}

export function catalogApiKeysFromEnv(): CatalogApiKeys {
	return {
		...(env.CATALOG_ANTHROPIC_API_KEY === undefined
			? {}
			: { anthropic: env.CATALOG_ANTHROPIC_API_KEY }),
		...(env.CATALOG_ANTIGRAVITY_OAUTH === undefined
			? {}
			: { antigravity: env.CATALOG_ANTIGRAVITY_OAUTH }),
		...(env.CATALOG_CURSOR_API_KEY === undefined
			? {}
			: { cursor: env.CATALOG_CURSOR_API_KEY }),
		...(env.CATALOG_OPENAI_API_KEY === undefined
			? {}
			: { openai: env.CATALOG_OPENAI_API_KEY }),
		...(env.CATALOG_XAI_API_KEY === undefined
			? {}
			: { xai: env.CATALOG_XAI_API_KEY }),
	};
}

function wrapKv(binding: CatalogKvBinding): CatalogKv {
	return {
		get: async (key) => {
			const value = await binding.get(key);
			return typeof value === "string" ? value : undefined;
		},
		put: async (key, value) => {
			await binding.put(key, value);
		},
		delete: async (key) => {
			await binding.delete(key);
		},
	};
}

function isWaitUntil(
	value: unknown,
): value is (work: Promise<unknown>) => void {
	return typeof value === "function";
}

function runWithoutWaitUntil(work: Promise<unknown>): void {
	void work;
}

export async function catalogWorkerBindings(): Promise<{
	kv: CatalogKv | undefined;
	schedule: (work: Promise<unknown>) => void;
}> {
	try {
		const workers: unknown = await import("cloudflare:workers");
		if (!isRecord(workers)) {
			return { kv: undefined, schedule: runWithoutWaitUntil };
		}
		const { waitUntil } = workers;
		const schedule = isWaitUntil(waitUntil)
			? (work: Promise<unknown>) => {
					waitUntil(work);
				}
			: runWithoutWaitUntil;
		const { env: workerEnv } = workers;
		if (!isRecord(workerEnv)) {
			return { kv: undefined, schedule };
		}
		const binding = workerEnv["MODEL_CATALOG"];
		if (!isCatalogKvBinding(binding)) {
			return { kv: undefined, schedule };
		}
		return { kv: wrapKv(binding), schedule };
	} catch {
		return { kv: undefined, schedule: runWithoutWaitUntil };
	}
}

export async function readWorkerModelCatalog(
	engine: EngineKind,
): Promise<ParseResult<ModelCatalog>> {
	const { kv, schedule } = await catalogWorkerBindings();
	if (kv === undefined) {
		return { kind: "invalid", message: msg.catalog_cache_unavailable() };
	}
	return readCachedModelCatalog({
		engine,
		keys: catalogApiKeysFromEnv(),
		kv,
		now: Date.now(),
		schedule,
	});
}

export async function clearWorkerModelCatalog(): Promise<CatalogCacheClear> {
	const { kv } = await catalogWorkerBindings();
	if (kv === undefined) {
		return {
			kind: "unavailable",
			message: msg.catalog_cache_unavailable(),
		};
	}
	await clearCachedCatalogs(kv);
	return { kind: "cleared" };
}
