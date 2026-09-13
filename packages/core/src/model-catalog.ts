import { z } from "zod";

import { ANTHROPIC_LIST_URL } from "./catalog/anthropic.ts";
import { ANTIGRAVITY_LIST_URL } from "./catalog/antigravity.ts";
import { CURSOR_LIST_URL } from "./catalog/cursor.ts";
import { GROK_LIST_URL } from "./catalog/grok.ts";
import { OPENAI_LIST_URL } from "./catalog/openai.ts";
import {
	catalogModel,
	effort,
	engineKind,
	modelCatalog,
	modelName,
} from "./domain.ts";
import type {
	CatalogModel,
	EngineKind,
	ModelCatalog,
	ParseResult,
} from "./domain.ts";
import { fromParseResult, parseUnknown } from "./zod-parse.ts";

export { parseAnthropicModelList } from "./catalog/anthropic.ts";
export { parseCursorModelList } from "./catalog/cursor.ts";
export { parseOpenAiCompatibleModelList } from "./catalog/openai.ts";

const CATALOG_URL = {
	claude: ANTHROPIC_LIST_URL,
	codex: OPENAI_LIST_URL,
	cursor: CURSOR_LIST_URL,
	grok: GROK_LIST_URL,
	antigravity: ANTIGRAVITY_LIST_URL,
} as const satisfies Record<EngineKind, string>;

export function catalogSourceUrl(engine: EngineKind): string {
	return CATALOG_URL[engine];
}

export type { CatalogHttp } from "./catalog/http.ts";
export { fetchJsonList } from "./catalog/http.ts";

function parseOptionalBool(value: unknown): boolean | undefined {
	if (value === true || value === false) {
		return value;
	}
	return undefined;
}

const effortItemSchema = fromParseResult(
	z.string({ error: "catalog model effort is not a string" }),
	effort,
);

const catalogModelObjectSchema = z.object(
	{
		contextWindow: z.unknown().optional(),
		displayName: z.unknown().optional(),
		efforts: z
			.array(effortItemSchema, {
				error: "catalog model efforts is not an array",
			})
			.optional(),
		id: z.unknown().optional(),
		supportsFast: z.unknown().optional(),
	},
	{ error: "catalog model is not an object" },
);

export function parseCatalogModelValue(
	raw: unknown,
): ParseResult<CatalogModel> {
	const parsed = parseUnknown(catalogModelObjectSchema, raw);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	const { id, displayName } = parsed.value;
	if (typeof id !== "string" || typeof displayName !== "string") {
		return { kind: "invalid", message: "catalog model is missing id or name" };
	}
	const contextWindow =
		typeof parsed.value.contextWindow === "number"
			? parsed.value.contextWindow
			: undefined;
	const supportsFast = parseOptionalBool(parsed.value.supportsFast);
	return catalogModel({
		displayName,
		id,
		...(contextWindow === undefined ? {} : { contextWindow }),
		...(parsed.value.efforts === undefined
			? {}
			: { efforts: parsed.value.efforts }),
		...(supportsFast === undefined ? {} : { supportsFast }),
	});
}

const modelCatalogObjectSchema = z.object(
	{
		engine: z.string({ error: "model catalog engine is missing" }),
		models: z.array(z.unknown(), {
			error: "model catalog models is not an array",
		}),
		recommended: z.unknown().optional(),
	},
	{ error: "model catalog is not an object" },
);

export function parseModelCatalogValue(
	raw: unknown,
): ParseResult<ModelCatalog> {
	const parsed = parseUnknown(modelCatalogObjectSchema, raw);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	const parsedEngine = engineKind(parsed.value.engine);
	if (parsedEngine.kind === "invalid") {
		return parsedEngine;
	}
	const models: CatalogModel[] = [];
	for (const item of parsed.value.models) {
		const model = parseCatalogModelValue(item);
		if (model.kind === "invalid") {
			return model;
		}
		models.push(model.value);
	}
	const recommendedRaw =
		typeof parsed.value.recommended === "string"
			? parsed.value.recommended
			: undefined;
	const recommended =
		recommendedRaw === undefined ? undefined : modelName(recommendedRaw);
	if (recommended !== undefined && recommended.kind === "invalid") {
		return recommended;
	}
	return modelCatalog({
		engine: parsedEngine.value,
		models,
		...(recommended?.kind === "ok" ? { recommended: recommended.value } : {}),
	});
}
