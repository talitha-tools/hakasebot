import { capturingJsonFetch } from "@hakasebot/test-kit/helpers/catalog-http.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import { parseAntigravityDiscoveryList } from "#/antigravity-catalog.ts";
import {
	ANTIGRAVITY_TOKEN_URL,
	FETCH_AVAILABLE_MODELS_PATH,
} from "#/antigravity-oauth.ts";
import { fetchOfficialModelCatalog } from "#/catalog-fetch.ts";
import type { CatalogHttp } from "#/model-catalog.ts";

const OAUTH_JSON = JSON.stringify({
	auth_method: "consumer",
	token: {
		access_token: "ya29.stale",
		expiry: "2020-01-01T00:00:00.000000000Z",
		refresh_token: "1//04-test-refresh",
		token_type: "Bearer",
	},
});

const DISCOVERY = {
	models: {
		chat_20706: { displayName: "Chat junk" },
		"claude-sonnet-4-6": {
			displayName: "Claude Sonnet 4.6",
			maxTokens: 200_000,
			recommended: true,
		},
		"gemini-2.5-pro": { displayName: "Gemini 2.5 Pro" },
		"gemini-3-flash": {
			displayName: "Gemini 3 Flash",
			isInternal: true,
			maxTokens: 1_000_000,
		},
		"gemini-3-flash-agent": {
			displayName: "Gemini 3 Flash",
			maxTokens: 1_000_000,
		},
	},
};

test("parseAntigravityDiscoveryList drops denylisted and internal ids", () => {
	const catalog = must(parseAntigravityDiscoveryList(DISCOVERY));
	expect(catalog.engine).toBe("antigravity");
	expect(catalog.models.map((item) => item.id)).toEqual([
		"claude-sonnet-4-6",
		"gemini-3-flash-agent",
	]);
	expect(catalog.recommended).toBe("claude-sonnet-4-6");
	expect(catalog.models[0]?.contextWindow).toBe(200_000);
});

test("parseAntigravityDiscoveryList keeps the first recommended id before sort", () => {
	const catalog = must(
		parseAntigravityDiscoveryList({
			models: {
				"z-last": { displayName: "Zeta", recommended: true },
				"a-first": { displayName: "Alpha", recommended: true },
			},
		}),
	);
	expect(catalog.recommended).toBe("z-last");
	expect(catalog.models.map((item) => item.id)).toEqual(["a-first", "z-last"]);
});

test("antigravity catalog refreshes oauth then scrapes fetchAvailableModels", async () => {
	const calls: { method?: string; url: string }[] = [];
	const fetchImpl: CatalogHttp = (url, init) => {
		calls.push({
			url,
			...(init?.method === undefined ? {} : { method: init.method }),
		});
		if (url === ANTIGRAVITY_TOKEN_URL) {
			return Response.json({ access_token: "ya29.fresh", expires_in: 3600 });
		}
		if (url.endsWith(FETCH_AVAILABLE_MODELS_PATH)) {
			return Response.json(DISCOVERY);
		}
		return Response.json({ error: "unexpected" }, { status: 500 });
	};
	const catalog = must(
		await fetchOfficialModelCatalog({
			engine: "antigravity",
			fetchImpl,
			keys: { antigravity: OAUTH_JSON },
		}),
	);
	expect(calls[0]).toEqual({ method: "POST", url: ANTIGRAVITY_TOKEN_URL });
	expect(calls[1]?.method).toBe("POST");
	expect(calls[1]?.url).toContain(FETCH_AVAILABLE_MODELS_PATH);
	expect(catalog.models.map((item) => item.id)).toEqual([
		"claude-sonnet-4-6",
		"gemini-3-flash-agent",
	]);
});

test("antigravity catalog without oauth does not fetch", async () => {
	const captured = capturingJsonFetch({
		models: [{ name: "models/gemini-2.5-pro" }],
	});
	const result = await fetchOfficialModelCatalog({
		engine: "antigravity",
		fetchImpl: captured.fetchImpl,
		keys: { anthropic: "sk-ant-not-used" },
	});
	expect(result.kind).toBe("invalid");
	expect(captured.calls).toEqual([]);
});
