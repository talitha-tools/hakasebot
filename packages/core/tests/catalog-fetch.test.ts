import { capturingJsonFetch } from "@hakasebot/test-kit/helpers/catalog-http.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import { fetchOfficialModelCatalog } from "#/catalog-fetch.ts";
import type { CatalogHttp } from "#/model-catalog.ts";
import { catalogSourceUrl } from "#/model-catalog.ts";

function jsonFetch(payload: unknown, status = 200): CatalogHttp {
	return () => Response.json(payload, { status });
}

test("claude lists from anthropic with x-api-key", async () => {
	const captured = capturingJsonFetch({
		data: [
			{
				display_name: "Claude Opus 5",
				id: "claude-opus-5",
				type: "model",
			},
		],
	});
	const catalog = must(
		await fetchOfficialModelCatalog({
			engine: "claude",
			fetchImpl: captured.fetchImpl,
			keys: { anthropic: "sk-ant-api03-test" },
		}),
	);
	expect(captured.calls).toEqual([
		{
			headers: {
				"anthropic-version": "2023-06-01",
				"x-api-key": "sk-ant-api03-test",
			},
			url: catalogSourceUrl("claude"),
		},
	]);
	expect(catalog.models[0]?.id).toBe("claude-opus-5");
});

test("missing api key is invalid without a network call", async () => {
	const captured = capturingJsonFetch({ data: [{ id: "gpt-5" }] });
	const result = await fetchOfficialModelCatalog({
		engine: "codex",
		fetchImpl: captured.fetchImpl,
		keys: {},
	});
	expect(result).toEqual({
		kind: "invalid",
		message: "no catalog api key for codex",
	});
	expect(captured.calls).toEqual([]);
});

test("vendor failure is invalid, not thrown", async () => {
	const result = await fetchOfficialModelCatalog({
		engine: "grok",
		fetchImpl: jsonFetch({ error: "nope" }, 401),
		keys: { xai: "xai-test" },
	});
	expect(result.kind).toBe("invalid");
	if (result.kind === "invalid") {
		expect(result.message).toContain("401");
	}
});

test("non-json 200 is invalid, not thrown", async () => {
	const result = await fetchOfficialModelCatalog({
		engine: "grok",
		fetchImpl: () => new Response("<html>nope</html>", { status: 200 }),
		keys: { xai: "xai-test" },
	});
	expect(result).toEqual({
		kind: "invalid",
		message: "grok model list is not JSON",
	});
});
