import { anthropicList } from "./catalog/anthropic.ts";
import { fetchAntigravityCatalog } from "./catalog/antigravity.ts";
import { cursorList } from "./catalog/cursor.ts";
import { grokList } from "./catalog/grok.ts";
import type { CatalogHttp } from "./catalog/http.ts";
import { fetchJsonList } from "./catalog/http.ts";
import { openaiList } from "./catalog/openai.ts";
import type { EngineKind, ModelCatalog, ParseResult } from "./domain.ts";

export type CatalogProvider =
	| "anthropic"
	| "openai"
	| "xai"
	| "cursor"
	| "antigravity";

export type CatalogApiKeys = Partial<Record<CatalogProvider, string>>;

interface GetListConfig {
	headers: (apiKey: string) => Record<string, string>;
	parse: (json: unknown) => ParseResult<ModelCatalog>;
	provider: CatalogProvider;
	url: string;
}

const GET_LIST_CONFIG = {
	claude: anthropicList,
	codex: openaiList,
	cursor: cursorList,
	grok: grokList,
} as const satisfies Record<Exclude<EngineKind, "antigravity">, GetListConfig>;

export function catalogProviderFor(engine: EngineKind): CatalogProvider {
	if (engine === "antigravity") {
		return "antigravity";
	}
	return GET_LIST_CONFIG[engine].provider;
}

export function catalogApiKeyFor(args: {
	engine: EngineKind;
	keys: CatalogApiKeys;
}): string | undefined {
	const key = args.keys[catalogProviderFor(args.engine)];
	if (key === undefined) {
		return undefined;
	}
	const trimmed = key.trim();
	return trimmed.length === 0 ? undefined : trimmed;
}

function httpImpl(fetchImpl?: CatalogHttp): CatalogHttp {
	return fetchImpl ?? (async (url, init) => fetch(url, init));
}

async function fetchGetCatalog(args: {
	apiKey: string;
	engine: Exclude<EngineKind, "antigravity">;
	fetchImpl: CatalogHttp;
}): Promise<ParseResult<ModelCatalog>> {
	const config = GET_LIST_CONFIG[args.engine];
	const json = await fetchJsonList({
		fetchImpl: args.fetchImpl,
		headers: config.headers(args.apiKey),
		label: args.engine,
		url: config.url,
	});
	if (json.kind === "invalid") {
		return json;
	}
	return config.parse(json.value);
}

export async function fetchOfficialCatalog(args: {
	apiKey: string;
	engine: EngineKind;
	fetchImpl?: CatalogHttp;
}): Promise<ParseResult<ModelCatalog>> {
	const fetchImpl = httpImpl(args.fetchImpl);
	if (args.engine === "antigravity") {
		return fetchAntigravityCatalog({
			fetchImpl,
			oauthJson: args.apiKey,
		});
	}
	return fetchGetCatalog({
		apiKey: args.apiKey,
		engine: args.engine,
		fetchImpl,
	});
}

export async function fetchOfficialModelCatalog(args: {
	engine: EngineKind;
	fetchImpl?: CatalogHttp;
	keys: CatalogApiKeys;
}): Promise<ParseResult<ModelCatalog>> {
	const apiKey = catalogApiKeyFor({
		engine: args.engine,
		keys: args.keys,
	});
	if (apiKey === undefined) {
		return {
			kind: "invalid",
			message: `no catalog api key for ${args.engine}`,
		};
	}
	return fetchOfficialCatalog({
		apiKey,
		engine: args.engine,
		...(args.fetchImpl === undefined ? {} : { fetchImpl: args.fetchImpl }),
	});
}
