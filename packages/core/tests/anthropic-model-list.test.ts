import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import { parseAnthropicModelList } from "#/model-catalog.ts";

const CLAUDE_LIST = {
	data: [
		{ display_name: "Claude Opus 5", id: "claude-opus-5", type: "model" },
		{ display_name: "Claude Sonnet 5", id: "claude-sonnet-5", type: "model" },
		{ display_name: "Claude Haiku 4.5", id: "claude-haiku-4-5", type: "model" },
	],
} as const;

test("parseAnthropicModelList takes the first live model as recommended", () => {
	const catalog = must(parseAnthropicModelList(CLAUDE_LIST));
	expect(catalog.engine).toBe("claude");
	expect(catalog.models.map((item) => item.id)).toEqual([
		"claude-opus-5",
		"claude-sonnet-5",
		"claude-haiku-4-5",
	]);
	expect(catalog.recommended).toBe("claude-opus-5");
});

test("parseAnthropicModelList sorts by created_at newest first", () => {
	const catalog = must(
		parseAnthropicModelList({
			data: [
				{
					created_at: "2025-01-01T00:00:00Z",
					display_name: "Claude Sonnet 5",
					id: "claude-sonnet-5",
					type: "model",
				},
				{
					created_at: "2026-01-01T00:00:00Z",
					display_name: "Claude Opus 5",
					id: "claude-opus-5",
					type: "model",
				},
			],
		}),
	);
	expect(catalog.models.map((item) => item.id)).toEqual([
		"claude-opus-5",
		"claude-sonnet-5",
	]);
	expect(catalog.recommended).toBe("claude-opus-5");
});

test("parseAnthropicModelList rejects a payload with no models", () => {
	expect(parseAnthropicModelList({ data: [] }).kind).toBe("invalid");
	expect(parseAnthropicModelList("nope").kind).toBe("invalid");
});

test("parseAnthropicModelList reads max_input_tokens and capabilities.effort", () => {
	const catalog = must(
		parseAnthropicModelList({
			data: [
				{
					capabilities: {
						effort: {
							supported: true,
							low: { supported: true },
							medium: { supported: true },
							high: { supported: true },
							xhigh: { supported: true },
							max: { supported: true },
						},
					},
					created_at: "2026-08-28T00:00:00Z",
					display_name: "Claude Fable 5.1",
					id: "claude-fable-5-1",
					max_input_tokens: 1_000_000,
					max_tokens: 128_000,
					type: "model",
				},
				{
					capabilities: {
						effort: {
							supported: true,
							low: { supported: true },
							medium: { supported: true },
							high: { supported: true },
							xhigh: { supported: false },
							max: { supported: false },
						},
					},
					created_at: "2025-11-24T00:00:00Z",
					display_name: "Claude Opus 4.5",
					id: "claude-opus-4-5-20251101",
					max_input_tokens: 200_000,
					max_tokens: 64_000,
					type: "model",
				},
				{
					capabilities: {
						effort: {
							supported: false,
							low: { supported: false },
							medium: { supported: false },
							high: { supported: false },
							xhigh: { supported: false },
							max: { supported: false },
						},
					},
					created_at: "2025-10-15T00:00:00Z",
					display_name: "Claude Haiku 4.5",
					id: "claude-haiku-4-5-20251001",
					max_input_tokens: 200_000,
					max_tokens: 64_000,
					type: "model",
				},
			],
		}),
	);
	expect(catalog.models).toMatchObject([
		{
			contextWindow: 1_000_000,
			displayName: "Claude Fable 5.1",
			efforts: ["low", "medium", "high", "max"],
			id: "claude-fable-5-1",
		},
		{
			contextWindow: 200_000,
			displayName: "Claude Opus 4.5",
			efforts: ["low", "medium", "high"],
			id: "claude-opus-4-5-20251101",
		},
		{
			contextWindow: 200_000,
			displayName: "Claude Haiku 4.5",
			id: "claude-haiku-4-5-20251001",
		},
	]);
	expect(catalog.models[2]?.efforts).toBeUndefined();
});
