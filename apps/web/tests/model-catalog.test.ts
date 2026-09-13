import { parseCursorModelList } from "@hakasebot/core/model-catalog.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { describe, expect, test } from "vitest";

describe("catalog metadata parsers", () => {
	test("cursor accepts items and contextWindow", () => {
		const catalog = must(
			parseCursorModelList({
				items: [
					{
						contextWindow: 200_000,
						displayName: "Composer",
						fast: true,
						id: "composer",
					},
				],
			}),
		);
		expect(catalog.models[0]).toMatchObject({
			contextWindow: 200_000,
			id: "composer",
			supportsFast: true,
		});
	});
});
