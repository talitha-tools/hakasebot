import { expect, test } from "vitest";

import { collectModels } from "#/model-list-fields.ts";

function idsOf(items: unknown[]) {
	return collectModels(items, (item) =>
		typeof item["name"] === "string" ? item["name"] : undefined,
	).map((model) => model.id);
}

test("collectModels drops non-coding ids and vendor types", () => {
	expect(
		idsOf([
			{ id: "gpt-5", object: "model" },
			"nope",
			[],
			1,
			{ id: "text-embedding-3-large", object: "model" },
			{ id: "whisper-1", object: "model" },
			{ id: "dall-e-3", object: "model" },
			{ id: "gpt-image-1", object: "model" },
			{ id: "grok-imagine-video", object: "model" },
			{ id: "sora-2", object: "model" },
			{ capabilities: { type: "embeddings" }, id: "mystery-embed" },
			{ id: "tts-1", object: "model" },
		]),
	).toEqual(["gpt-5"]);
});

test("collectModels keeps generateContent gemini rows and drops embed-only", () => {
	expect(
		idsOf([
			{
				id: "gemini-2.5-pro",
				supportedGenerationMethods: ["generateContent"],
			},
			{
				id: "text-embedding-004",
				supportedGenerationMethods: ["embedContent"],
			},
		]),
	).toEqual(["gemini-2.5-pro"]);
});

test("collectModels sorts newest created first and keeps vendor order as a tiebreak", () => {
	expect(
		idsOf([
			{ created: 1000, id: "gpt-4o", object: "model" },
			{ created: 3000, id: "gpt-5", object: "model" },
			{ created: 2000, id: "gpt-5-mini", object: "model" },
			{ created: 4000, id: "text-embedding-3-large", object: "model" },
		]),
	).toEqual(["gpt-5", "gpt-5-mini", "gpt-4o"]);
	expect(
		idsOf([
			{ created_at: "2024-01-01T00:00:00Z", id: "claude-sonnet-4" },
			{ created_at: "2026-01-01T00:00:00Z", id: "claude-opus-5" },
			{ id: "claude-haiku-4-5" },
		]),
	).toEqual(["claude-opus-5", "claude-sonnet-4", "claude-haiku-4-5"]);
});

test("collectModels reads nested context, efforts, and fast flags", () => {
	expect(
		collectModels(
			[
				{
					capabilities: {
						limits: { max_context_window_tokens: 128_000 },
						supports: { fast: true },
					},
					id: "gpt-5",
					name: "GPT-5",
					supportedReasoningEfforts: ["low", "medium", "high", "xhigh"],
				},
			],
			(item) => (typeof item["name"] === "string" ? item["name"] : undefined),
		)[0],
	).toMatchObject({
		contextWindow: 128_000,
		displayName: "GPT-5",
		efforts: ["low", "medium", "high", "max"],
		id: "gpt-5",
		supportsFast: true,
	});
});

test("collectModels does not invent efforts from a bare reasoning flag", () => {
	expect(
		collectModels(
			[
				{
					capabilities: { supports: { reasoningEffort: true } },
					id: "gpt-5",
					name: "GPT-5",
				},
			],
			(item) => (typeof item["name"] === "string" ? item["name"] : undefined),
		)[0]?.efforts,
	).toBeUndefined();
});

test("collectModels reads context_length", () => {
	expect(
		collectModels(
			[{ context_length: 500_000, id: "grok-4.6", object: "model" }],
			(item) => (typeof item["id"] === "string" ? item["id"] : undefined),
		)[0],
	).toMatchObject({ contextWindow: 500_000, id: "grok-4.6" });
});

test("collectModels drops picker-hidden rows and past openai shutdown_date", () => {
	expect(
		idsOf([
			{ id: "gpt-4.1", model_picker_enabled: false, name: "GPT-4.1" },
			{ id: "gpt-5", model_picker_enabled: true, name: "GPT-5" },
			{
				id: "gpt-4o",
				object: "model",
				shutdown_date: "2020-01-01",
			},
			{
				id: "gpt-5.4",
				object: "model",
				shutdown_date: "2099-12-31",
			},
			{ deprecated: true, id: "claude-opus-4", type: "model" },
		]),
	).toEqual(["gpt-5", "gpt-5.4", "claude-opus-4"]);
});

test("collectModels skips a row when idOf returns undefined", () => {
	expect(
		collectModels(
			[
				{ id: "latest", object: "model" },
				{ id: "grok-4.6", object: "model" },
			],
			(item) => (typeof item["id"] === "string" ? item["id"] : undefined),
			(item) => (item["id"] === "latest" ? undefined : String(item["id"])),
		).map((model) => model.id),
	).toEqual(["grok-4.6"]);
});
