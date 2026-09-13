import { z } from "zod";

import { tokensFrom } from "#/catalog-coding.ts";
import { modelCatalog } from "#/domain.ts";
import type { ModelCatalog, ParseResult } from "#/domain.ts";
import { collectModels } from "#/model-list-fields.ts";
import {
	firstParsed,
	keepParsed,
	parseArrayField,
	unknownArraySchema,
} from "#/zod-parse.ts";

import { bearerListHeaders } from "./http.ts";

export const GROK_LIST_URL = "https://api.x.ai/v1/models";

const UNSTABLE_GROK_TOKENS = new Set([
	"beta",
	"build",
	"experimental",
	"latest",
	"preview",
]);

const grokAliasSchema = z.string().min(1);

function grokIdIsUnstable(id: string): boolean {
	return tokensFrom(id).some(
		(token) =>
			UNSTABLE_GROK_TOKENS.has(token) ||
			/^gv\d+$/u.test(token) ||
			/^\d{4}$/u.test(token) ||
			/^\d{8}$/u.test(token),
	);
}

function grokAliases(item: Record<string, unknown>): string[] {
	const aliases = unknownArraySchema.safeParse(item["aliases"]);
	return aliases.success ? keepParsed(grokAliasSchema, aliases.data) : [];
}

function grokIdFrom(item: Record<string, unknown>): string | undefined {
	const id = firstParsed(z.string().min(1), [item["id"]]);
	if (id === undefined) {
		return undefined;
	}
	if (!grokIdIsUnstable(id)) {
		return id;
	}
	return grokAliases(item).find((alias) => !grokIdIsUnstable(alias));
}

export function parseGrokModelList(json: unknown): ParseResult<ModelCatalog> {
	const items = parseArrayField(
		json,
		["data", "models"],
		"grok model list is not an object",
		"grok model list has no models",
	);
	if (items.kind === "invalid") {
		return items;
	}
	return modelCatalog({
		engine: "grok",
		models: collectModels(items.value, grokIdFrom, grokIdFrom),
	});
}

export const grokList = {
	headers: bearerListHeaders,
	parse: parseGrokModelList,
	provider: "xai" as const,
	url: GROK_LIST_URL,
};
