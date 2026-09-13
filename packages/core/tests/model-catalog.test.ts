import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import {
	catalogSourceUrl,
	parseCursorModelList,
	parseOpenAiCompatibleModelList,
} from "#/model-catalog.ts";

const CODEX_LIST = {
	data: [
		{ id: "gpt-5", object: "model" },
		{ id: "gpt-5-mini", object: "model" },
	],
	object: "list",
} as const;

test("catalogSourceUrl is a list endpoint for every engine", () => {
	expect(catalogSourceUrl("claude")).toContain("anthropic.com");
	expect(catalogSourceUrl("codex")).toContain("openai.com");
	expect(catalogSourceUrl("grok")).toContain("x.ai");
	expect(catalogSourceUrl("cursor")).toContain("cursor.com");
	expect(catalogSourceUrl("antigravity")).toContain(
		"daily-cloudcode-pa.googleapis.com",
	);
});

test("parseOpenAiCompatibleModelList takes the newest coding model as recommended", () => {
	const catalog = must(parseOpenAiCompatibleModelList(CODEX_LIST));
	expect(catalog.engine).toBe("codex");
	expect(catalog.models.map((item) => item.id)).toEqual([
		"gpt-5",
		"gpt-5-mini",
	]);
	expect(catalog.recommended).toBe("gpt-5");
});

test("parseOpenAiCompatibleModelList drops non-coding rows and sorts by created", () => {
	const catalog = must(
		parseOpenAiCompatibleModelList({
			data: [
				{ created: 1_700_000_000, id: "gpt-4o", object: "model" },
				{
					created: 1_800_000_000,
					id: "text-embedding-3-large",
					object: "model",
				},
				{ created: 1_900_000_000, id: "gpt-5", object: "model" },
				{ created: 2_000_000_000, id: "whisper-1", object: "model" },
			],
			object: "list",
		}),
	);
	expect(catalog.models.map((item) => item.id)).toEqual(["gpt-5", "gpt-4o"]);
	expect(catalog.recommended).toBe("gpt-5");
});

test("parseOpenAiCompatibleModelList reads chatgpt catalog metadata", () => {
	const catalog = must(
		parseOpenAiCompatibleModelList({
			data: [
				{
					context_window: 272_000,
					display_name: "GPT-5.4",
					id: "gpt-5.4",
					object: "model",
					supported_reasoning_levels: ["low", "medium", "high", "xhigh"],
				},
			],
		}),
	);
	expect(catalog.models[0]).toMatchObject({
		contextWindow: 272_000,
		displayName: "GPT-5.4",
		efforts: ["low", "medium", "high", "max"],
		id: "gpt-5.4",
	});
});

test("parseCursorModelList rejects empty payloads", () => {
	expect(parseCursorModelList({ items: [] }).kind).toBe("invalid");
	expect(parseOpenAiCompatibleModelList("nope")).toEqual({
		kind: "invalid",
		message: "codex model list is not an object",
	});
	expect(parseOpenAiCompatibleModelList({})).toEqual({
		kind: "invalid",
		message: "codex model list has no models",
	});
	expect(
		parseOpenAiCompatibleModelList({
			data: [{ id: "whisper-1", object: "model" }],
		}),
	).toEqual({
		kind: "invalid",
		message: "model catalog is empty",
	});
});
