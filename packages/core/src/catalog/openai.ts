import { modelCatalog } from "#/domain.ts";
import type { ModelCatalog, ParseResult } from "#/domain.ts";
import { collectModels, displayNameFrom } from "#/model-list-fields.ts";
import { parseArrayField } from "#/zod-parse.ts";

import { bearerListHeaders } from "./http.ts";

export const OPENAI_LIST_URL = "https://api.openai.com/v1/models";

export function parseOpenAiCompatibleModelList(
	json: unknown,
): ParseResult<ModelCatalog> {
	const items = parseArrayField(
		json,
		["data", "models"],
		"codex model list is not an object",
		"codex model list has no models",
	);
	if (items.kind === "invalid") {
		return items;
	}
	return modelCatalog({
		engine: "codex",
		models: collectModels(items.value, (item) =>
			displayNameFrom(item, ["display_name", "displayName", "name", "id"]),
		),
	});
}

export const openaiList = {
	headers: bearerListHeaders,
	parse: parseOpenAiCompatibleModelList,
	provider: "openai" as const,
	url: OPENAI_LIST_URL,
};
