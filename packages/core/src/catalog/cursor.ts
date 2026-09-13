import { modelCatalog } from "#/domain.ts";
import type { ModelCatalog, ParseResult } from "#/domain.ts";
import { collectModels, displayNameFrom } from "#/model-list-fields.ts";
import { parseArrayField } from "#/zod-parse.ts";

import { bearerListHeaders } from "./http.ts";

export const CURSOR_LIST_URL = "https://api.cursor.com/v1/models";

export function parseCursorModelList(json: unknown): ParseResult<ModelCatalog> {
	const items = parseArrayField(
		json,
		["items", "data", "models"],
		"cursor model list is not an object",
	);
	if (items.kind === "invalid") {
		return items;
	}
	return modelCatalog({
		engine: "cursor",
		models: collectModels(items.value, (item) =>
			displayNameFrom(item, ["displayName", "display_name", "name"]),
		),
	});
}

export const cursorList = {
	headers: bearerListHeaders,
	parse: parseCursorModelList,
	provider: "cursor" as const,
	url: CURSOR_LIST_URL,
};
