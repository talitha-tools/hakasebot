import {
	catalogApiKeyFor,
	fetchOfficialCatalog,
} from "@hakasebot/core/catalog-fetch.ts";
import type { CatalogApiKeys } from "@hakasebot/core/catalog-fetch.ts";
import { ENGINE_KINDS } from "@hakasebot/core/domain.ts";
import type {
	EngineKind,
	ModelCatalog,
	ParseResult,
} from "@hakasebot/core/domain.ts";
import type { CatalogHttp } from "@hakasebot/core/model-catalog.ts";
import { parseModelCatalogValue } from "@hakasebot/core/model-catalog.ts";
import { parseJsonText } from "@hakasebot/core/zod-parse.ts";
import { z } from "zod";

import { m as msg } from "#/paraglide/messages.js";

export const CATALOG_FRESH_MS = 24 * 60 * 60 * 1000;

export interface CatalogKv {
	get: (key: string) => Promise<string | undefined>;
	put: (key: string, value: string) => Promise<void>;
	delete: (key: string) => Promise<void>;
}

export interface CachedCatalog {
	catalog: ModelCatalog;
	fetchedAt: number;
}

export interface CatalogCacheRead {
	engine: EngineKind;
	keys: CatalogApiKeys;
	kv: CatalogKv;
	now: number;
	schedule: (work: Promise<unknown>) => void;
	fetchImpl?: CatalogHttp;
}

export function catalogKvKey(engine: EngineKind): string {
	return `catalog:v1:${engine}`;
}

export async function clearCachedCatalogs(kv: CatalogKv): Promise<void> {
	await Promise.all(
		ENGINE_KINDS.map(async (engine) => {
			await kv.delete(catalogKvKey(engine));
		}),
	);
}

const cachedCatalogSchema = z.object(
	{
		catalog: z.unknown(),
		fetchedAt: z.number({
			error: msg.cached_catalog_fetched_at_missing(),
		}),
	},
	{ error: msg.cached_catalog_not_object() },
);

export function parseCachedCatalog(raw: string): ParseResult<CachedCatalog> {
	const parsed = parseJsonText(
		cachedCatalogSchema,
		raw,
		msg.cached_catalog_not_json(),
	);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	const catalog = parseModelCatalogValue(parsed.value.catalog);
	if (catalog.kind === "invalid") {
		return catalog;
	}
	return {
		kind: "ok",
		value: { catalog: catalog.value, fetchedAt: parsed.value.fetchedAt },
	};
}

async function readCachedCatalog(args: {
	engine: EngineKind;
	kv: CatalogKv;
}): Promise<CachedCatalog | undefined> {
	const raw = await args.kv.get(catalogKvKey(args.engine));
	if (raw === undefined) {
		return undefined;
	}
	const parsed = parseCachedCatalog(raw);
	return parsed.kind === "ok" ? parsed.value : undefined;
}

async function refreshCatalog(
	args: CatalogCacheRead,
): Promise<ParseResult<ModelCatalog>> {
	const apiKey = catalogApiKeyFor({
		engine: args.engine,
		keys: args.keys,
	});
	if (apiKey === undefined) {
		return {
			kind: "invalid",
			message: msg.catalog_api_key_missing({ engine: args.engine }),
		};
	}
	const catalog = await fetchOfficialCatalog({
		apiKey,
		engine: args.engine,
		...(args.fetchImpl === undefined ? {} : { fetchImpl: args.fetchImpl }),
	});
	if (catalog.kind === "invalid") {
		return catalog;
	}
	const cached: CachedCatalog = {
		catalog: catalog.value,
		fetchedAt: args.now,
	};
	await args.kv.put(catalogKvKey(args.engine), JSON.stringify(cached));
	return catalog;
}

export async function readCachedModelCatalog(
	args: CatalogCacheRead,
): Promise<ParseResult<ModelCatalog>> {
	const cached = await readCachedCatalog({
		engine: args.engine,
		kv: args.kv,
	});
	if (cached === undefined) {
		return refreshCatalog(args);
	}
	if (args.now - cached.fetchedAt >= CATALOG_FRESH_MS) {
		args.schedule(refreshCatalog(args));
	}
	return { kind: "ok", value: cached.catalog };
}
