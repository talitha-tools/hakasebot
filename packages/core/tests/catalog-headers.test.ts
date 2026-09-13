import { expect, test } from "vitest";

import { anthropicListHeaders, bearerListHeaders } from "#/catalog-headers.ts";

test("catalog-headers re-exports vendor list headers", () => {
	expect(anthropicListHeaders("k")).toEqual({
		"anthropic-version": "2023-06-01",
		"x-api-key": "k",
	});
	expect(bearerListHeaders("k")).toEqual({ Authorization: "Bearer k" });
});
