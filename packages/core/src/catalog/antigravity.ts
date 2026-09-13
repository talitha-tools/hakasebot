import { z } from "zod";

import {
	antigravityDiscoveryEndpoints,
	antigravityUserAgent,
	FETCH_AVAILABLE_MODELS_PATH,
	refreshAntigravityAccessToken,
} from "#/antigravity-oauth.ts";
import {
	catalogModel,
	modelCatalog,
	modelName,
	parseAntigravityOauthFields,
} from "#/domain.ts";
import type { CatalogModel, ModelCatalog, ParseResult } from "#/domain.ts";
import { parseInvalid } from "#/domain/parse.ts";
import {
	firstParsed,
	jsonObjectSchema,
	keepParsed,
	parseUnknown,
} from "#/zod-parse.ts";

import type { CatalogHttp } from "./http.ts";

export const ANTIGRAVITY_LIST_URL =
	"https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";

const ANTIGRAVITY_DISCOVERY_DENYLIST = new Set([
	"chat_20706",
	"chat_23310",
	"gemini-2.5-pro",
]);

function discoveryContextWindow(
	maxTokens: number | undefined,
): number | undefined {
	if (
		maxTokens === undefined ||
		!Number.isInteger(maxTokens) ||
		maxTokens < 1
	) {
		return undefined;
	}
	return maxTokens;
}

const antigravityEntrySchema = z
	.tuple([z.string(), jsonObjectSchema])
	.transform((entry, ctx) => {
		const [id, raw] = entry;
		if (ANTIGRAVITY_DISCOVERY_DENYLIST.has(id) || raw["isInternal"] === true) {
			ctx.addIssue({ code: "custom", message: "skipped antigravity model" });
			return z.NEVER;
		}
		const contextWindow = discoveryContextWindow(
			firstParsed(z.number(), [raw["maxTokens"]]),
		);
		const parsed = catalogModel({
			displayName: firstParsed(z.string(), [raw["displayName"]]) ?? id,
			id,
			...(contextWindow === undefined ? {} : { contextWindow }),
		});
		if (parsed.kind === "invalid") {
			ctx.addIssue({ code: "custom", message: parsed.message });
			return z.NEVER;
		}
		return {
			model: parsed.value,
			recommended: raw["recommended"] === true,
		};
	});

function collectAntigravityModels(modelsRaw: Record<string, unknown>): {
	models: CatalogModel[];
	recommended: string | undefined;
} {
	const collected = keepParsed(
		antigravityEntrySchema,
		Object.entries(modelsRaw),
	);
	const recommended = collected.find((entry) => entry.recommended)?.model.id;
	collected.sort(
		(left, right) =>
			left.model.displayName.localeCompare(right.model.displayName) ||
			left.model.id.localeCompare(right.model.id),
	);
	return {
		models: collected.map((entry) => entry.model),
		recommended,
	};
}

const antigravityModelsRecordSchema = z.record(z.string(), z.unknown(), {
	error: "antigravity model list has no models",
});

const antigravityDiscoverySchema = z.object(
	{
		models: antigravityModelsRecordSchema,
	},
	{ error: "antigravity model list is not an object" },
);

export function parseAntigravityDiscoveryList(
	json: unknown,
): ParseResult<ModelCatalog> {
	const parsed = parseUnknown(antigravityDiscoverySchema, json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	const { models, recommended } = collectAntigravityModels(parsed.value.models);
	const recommendedName =
		recommended === undefined ? undefined : modelName(recommended);
	if (recommendedName !== undefined && recommendedName.kind === "invalid") {
		return recommendedName;
	}
	return modelCatalog({
		engine: "antigravity",
		models,
		...(recommendedName?.kind === "ok"
			? { recommended: recommendedName.value }
			: {}),
	});
}

async function postDiscovery(args: {
	accessToken: string;
	endpoint: string;
	fetchImpl: CatalogHttp;
}): Promise<ParseResult<ModelCatalog>> {
	const url = `${args.endpoint}${FETCH_AVAILABLE_MODELS_PATH}`;
	let response: Response;
	try {
		response = await args.fetchImpl(url, {
			body: JSON.stringify({}),
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${args.accessToken}`,
				"Content-Type": "application/json",
				"User-Agent": antigravityUserAgent(),
			},
			method: "POST",
		});
	} catch {
		return parseInvalid("antigravity model list failed");
	}
	if (!response.ok) {
		return parseInvalid(
			`antigravity model list failed (${String(response.status)})`,
		);
	}
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		return parseInvalid("antigravity model list is not JSON");
	}
	return parseAntigravityDiscoveryList(payload);
}

export async function fetchAntigravityCatalog(args: {
	fetchImpl: CatalogHttp;
	oauthJson: string;
}): Promise<ParseResult<ModelCatalog>> {
	const fields = parseAntigravityOauthFields(args.oauthJson);
	if (fields.kind === "invalid") {
		return fields;
	}
	const access = await refreshAntigravityAccessToken({
		fetchImpl: args.fetchImpl,
		refreshToken: fields.value.refreshToken,
	});
	if (access.kind === "invalid") {
		return access;
	}
	for (const endpoint of antigravityDiscoveryEndpoints()) {
		// oxlint-disable-next-line eslint/no-await-in-loop -- primary then sandbox; stop at the first ok list
		const catalog = await postDiscovery({
			accessToken: access.value,
			endpoint,
			fetchImpl: args.fetchImpl,
		});
		if (catalog.kind === "ok") {
			return catalog;
		}
	}
	return parseInvalid("antigravity model list failed");
}
