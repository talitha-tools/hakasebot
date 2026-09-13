import { modelCatalog } from "#/domain.ts";
import type { ModelCatalog, ParseResult } from "#/domain.ts";
import { collectModels, displayNameFrom } from "#/model-list-fields.ts";
import { parseArrayField } from "#/zod-parse.ts";

export const ANTHROPIC_LIST_URL = "https://api.anthropic.com/v1/models";

export function anthropicListHeaders(apiKey: string): Record<string, string> {
	return {
		"anthropic-version": "2023-06-01",
		"x-api-key": apiKey,
	};
}

export function parseAnthropicModelList(
	json: unknown,
): ParseResult<ModelCatalog> {
	const items = parseArrayField(
		json,
		["data"],
		"anthropic model list is not an object",
	);
	if (items.kind === "invalid") {
		return items;
	}
	return modelCatalog({
		engine: "claude",
		models: collectModels(items.value, (item) =>
			displayNameFrom(item, ["display_name"]),
		),
	});
}

export const anthropicList = {
	headers: anthropicListHeaders,
	parse: parseAnthropicModelList,
	provider: "anthropic" as const,
	url: ANTHROPIC_LIST_URL,
};
