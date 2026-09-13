import { catalogModel, modelName } from "@hakasebot/core/domain.ts";
import type { CatalogModel, ModelName } from "@hakasebot/core/domain.ts";
import { similarModelOption } from "@hakasebot/core/vault/model-slot.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { describe, expect, test } from "vitest";

import {
	judgeModel,
	pickSimilarModel,
	similarModelFailureMessage,
	similarModelNotice,
} from "#/similar-model.ts";
import { isAuthFailureMessage } from "#/vault/runtime.ts";

function name(id: string): ModelName {
	return must(modelName(id));
}

function models(...ids: readonly string[]): CatalogModel[] {
	return ids.map((id) => must(catalogModel({ displayName: id, id })));
}

describe("similarModelOption", () => {
	test("missing and truthy values are on", () => {
		expect(similarModelOption(undefined)).toBe(true);
		// oxlint-disable-next-line unicorn/no-null -- JSON/D1 null is a live input
		expect(similarModelOption(null)).toBe(true);
		expect(similarModelOption(true)).toBe(true);
		expect(similarModelOption(1)).toBe(true);
	});

	test("explicit false values are off", () => {
		expect(similarModelOption(false)).toBe(false);
		expect(similarModelOption(0)).toBe(false);
		expect(similarModelOption("0")).toBe(false);
		expect(similarModelOption("false")).toBe(false);
	});
});

describe("pickSimilarModel", () => {
	test("opus 4.8 picks opus 5, not sonnet", () => {
		expect(
			pickSimilarModel({
				models: models(
					"claude-sonnet-4-6",
					"claude-opus-5",
					"claude-haiku-4-5",
				),
				requested: name("claude-opus-4-8"),
			}),
		).toBe("claude-opus-5");
	});

	test("picks the highest remaining version in the family", () => {
		expect(
			pickSimilarModel({
				models: models("claude-opus-4-6", "claude-opus-5"),
				requested: name("claude-opus-4-8"),
			}),
		).toBe("claude-opus-5");
	});

	test("claude-3-5-sonnet and claude-sonnet-4-6 are the same family", () => {
		expect(
			pickSimilarModel({
				models: models("claude-sonnet-4-6", "claude-opus-5"),
				requested: name("claude-3-5-sonnet-20241022"),
			}),
		).toBe("claude-sonnet-4-6");
	});

	test("gpt-4o does not become gpt-5", () => {
		expect(
			pickSimilarModel({
				models: models("gpt-5", "gpt-5-mini"),
				requested: name("gpt-4o"),
			}),
		).toBeUndefined();
	});

	test("gpt-5-mini stays on the mini line", () => {
		expect(
			pickSimilarModel({
				models: models("gpt-5", "gpt-5.4-mini"),
				requested: name("gpt-5-mini"),
			}),
		).toBe("gpt-5.4-mini");
	});

	test("opaque custom strings have no successor", () => {
		expect(
			pickSimilarModel({
				models: models("claude-opus-5"),
				requested: name("my-fine-tune"),
			}),
		).toBeUndefined();
	});
});

describe("judgeModel", () => {
	const requested = name("claude-opus-4-8");
	const listed = {
		kind: "listed" as const,
		models: models("claude-opus-5", "claude-sonnet-4-6"),
	};

	test("listed exact id uses the stored model", () => {
		expect(
			judgeModel({
				catalog: {
					kind: "listed",
					models: models("claude-opus-4-8", "claude-opus-5"),
				},
				requested,
				similarModel: true,
			}),
		).toEqual({
			basis: "listed",
			kind: "as-stored",
			model: requested,
		});
	});

	test("probe failure fails open to the stored id", () => {
		expect(
			judgeModel({
				catalog: { detail: "503", kind: "unavailable" },
				requested,
				similarModel: false,
			}),
		).toEqual({
			basis: "unchecked",
			kind: "as-stored",
			model: requested,
		});
	});

	test("option on substitutes a same-family successor", () => {
		expect(
			judgeModel({
				catalog: listed,
				requested,
				similarModel: true,
			}),
		).toEqual({
			kind: "substituted",
			model: name("claude-opus-5"),
			requested,
		});
	});

	test("option off refuses when a successor exists", () => {
		expect(
			judgeModel({
				catalog: listed,
				requested,
				similarModel: false,
			}),
		).toEqual({
			kind: "unresolved",
			requested,
			wouldHaveUsed: name("claude-opus-5"),
		});
	});

	test("custom unpublished strings run as stored", () => {
		expect(
			judgeModel({
				catalog: listed,
				requested: name("my-fine-tune"),
				similarModel: false,
			}),
		).toEqual({
			basis: "unlisted-custom",
			kind: "as-stored",
			model: name("my-fine-tune"),
		});
	});
});

describe("similar-model copy", () => {
	test("notice names both ids", () => {
		expect(
			similarModelNotice({
				requested: name("claude-opus-4-8"),
				used: name("claude-opus-5"),
			}),
		).toBe("this review used claude-opus-5 because claude-opus-4-8 went away.");
	});

	test("failure comment is not an auth-shaped queue retry", () => {
		const message = similarModelFailureMessage({
			kind: "unresolved",
			requested: name("claude-opus-4-8"),
			wouldHaveUsed: name("claude-opus-5"),
		});
		expect(message).toContain("you said no cousins");
		expect(message).toContain("claude-opus-5 is still around");
		expect(isAuthFailureMessage(message)).toBe(false);
	});
});
