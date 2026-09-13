import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import { parseGrokModelList } from "#/grok-model-list.ts";

const GROK_LIST = {
	data: [
		{
			aliases: [
				"grok-4.20-non-reasoning",
				"grok-4.20-non-reasoning-latest",
				"grok-4.20-beta-non-reasoning",
			],
			context_length: 1_000_000,
			created: 1_773_014_400,
			id: "grok-4.20-0309-non-reasoning",
			object: "model",
		},
		{
			aliases: [
				"grok-4.20-reasoning-latest",
				"grok-4.20",
				"grok-4.20-reasoning",
				"grok-4.20-0309",
				"grok-4.20-beta",
			],
			context_length: 1_000_000,
			created: 1_773_014_400,
			id: "grok-4.20-0309-reasoning",
			long_context_threshold: 200_000,
			object: "model",
		},
		{
			aliases: ["grok-4.3-latest"],
			context_length: 1_000_000,
			created: 1_776_384_000,
			id: "grok-4.3",
			object: "model",
		},
		{
			aliases: ["grok-4.5-latest", "grok-build-latest"],
			context_length: 500_000,
			created: 1_782_691_200,
			id: "grok-4.5",
			object: "model",
		},
		{
			aliases: [],
			context_length: 500_000,
			created: 1_785_974_400,
			id: "grok-4.6",
			object: "model",
		},
		{
			aliases: ["grok-code-fast-1", "grok-code-fast", "grok-code-fast-1-0825"],
			context_length: 256_000,
			created: 1_776_297_600,
			id: "grok-build-0.1",
			object: "model",
		},
		{
			aliases: ["grok-imagine-image-2026-03-02"],
			context_length: 8000,
			created: 1_769_558_400,
			id: "grok-imagine-image",
			image_price: 200_000_000,
			object: "model",
		},
		{
			aliases: [],
			created: 1_786_147_200,
			id: "grok-imagine-video",
			object: "model",
		},
		{
			aliases: [],
			context_length: 131_072,
			created: 1_786_200_000,
			id: "latest",
			object: "model",
		},
	],
	object: "list",
} as const;

test("parseGrokModelList prefers stable aliases and drops image video and latest", () => {
	const catalog = must(parseGrokModelList(GROK_LIST));
	expect(catalog.engine).toBe("grok");
	expect(catalog.models.map((item) => item.id)).toEqual([
		"grok-4.6",
		"grok-4.5",
		"grok-4.3",
		"grok-code-fast-1",
		"grok-4.20-non-reasoning",
		"grok-4.20",
	]);
	expect(catalog.recommended).toBe("grok-4.6");
});

test("parseGrokModelList reads context_length and ignores long_context_threshold", () => {
	const catalog = must(parseGrokModelList(GROK_LIST));
	expect(catalog.models[0]).toMatchObject({
		contextWindow: 500_000,
		id: "grok-4.6",
	});
	expect(catalog.models.find((item) => item.id === "grok-4.20")).toMatchObject({
		contextWindow: 1_000_000,
		id: "grok-4.20",
	});
	const thresholdOnly = must(
		parseGrokModelList({
			data: [
				{
					id: "grok-4.6",
					long_context_threshold: 200_000,
					object: "model",
				},
			],
		}),
	);
	expect(thresholdOnly.models[0]?.contextWindow).toBeUndefined();
});

test("parseGrokModelList rejects a payload with no models", () => {
	expect(parseGrokModelList({ data: [] }).kind).toBe("invalid");
	expect(parseGrokModelList("nope")).toEqual({
		kind: "invalid",
		message: "grok model list is not an object",
	});
	expect(parseGrokModelList({})).toEqual({
		kind: "invalid",
		message: "grok model list has no models",
	});
});
