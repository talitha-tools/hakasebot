import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import { catalogModel, modelCatalog } from "#/domain.ts";
import { parseHomeRuntimePack } from "#/home/runtime-pack.ts";

const emptyPrefs = {
	repos: [],
	slots: [],
	version: 1 as const,
};

const emptyVault = {
	accounts: [],
	version: 1 as const,
};

function packBody(catalogs: unknown) {
	return {
		catalogs,
		prefs: emptyPrefs,
		vault: emptyVault,
		version: 1 as const,
	};
}

const claudeCatalogJson = {
	engine: "claude",
	models: [{ displayName: "Opus 4", id: "claude-opus-4" }],
};

const claudeModel = must(
	catalogModel({ displayName: "Opus 4", id: "claude-opus-4" }),
);
const claudeCatalog = must(
	modelCatalog({
		engine: "claude",
		models: [claudeModel],
	}),
);

test("parseHomeRuntimePack treats a missing catalogs field as empty", () => {
	expect(
		parseHomeRuntimePack({
			prefs: emptyPrefs,
			vault: emptyVault,
			version: 1,
		}),
	).toEqual({
		kind: "ok",
		value: {
			catalogs: {},
			prefs: emptyPrefs,
			vault: emptyVault,
			version: 1,
		},
	});
});

test("parseHomeRuntimePack treats undefined catalogs as empty", () => {
	expect(parseHomeRuntimePack(packBody(undefined))).toEqual({
		kind: "ok",
		value: {
			catalogs: {},
			prefs: emptyPrefs,
			vault: emptyVault,
			version: 1,
		},
	});
});

test("parseHomeRuntimePack rejects catalogs that are not a record", () => {
	expect(parseHomeRuntimePack(packBody(["claude"]))).toEqual({
		kind: "invalid",
		message: "runtime pack catalogs is not an object",
	});
	expect(parseHomeRuntimePack(packBody("nope"))).toEqual({
		kind: "invalid",
		message: "runtime pack catalogs is not an object",
	});
	expect(
		parseHomeRuntimePack(
			packBody(
				// oxlint-disable-next-line unicorn/no-null -- catalogs: null is a malformed pack wire value
				null,
			),
		),
	).toEqual({
		kind: "invalid",
		message: "runtime pack catalogs is not an object",
	});
});

test("parseHomeRuntimePack rejects an invalid catalog for a recognised engine", () => {
	const parsed = parseHomeRuntimePack(
		packBody({ claude: { engine: "claude", models: "nope" } }),
	);
	expect(parsed.kind).toBe("invalid");
});

test("parseHomeRuntimePack rejects a catalog whose engine does not match the key", () => {
	expect(
		parseHomeRuntimePack(
			packBody({
				claude: {
					engine: "codex",
					models: [{ displayName: "GPT-5", id: "gpt-5" }],
				},
			}),
		),
	).toEqual({
		kind: "invalid",
		message: "runtime pack catalog engine does not match",
	});
});

test("parseHomeRuntimePack skips unknown engine keys", () => {
	expect(
		parseHomeRuntimePack(
			packBody({
				claude: claudeCatalogJson,
				nope: { engine: "claude", models: "garbage" },
			}),
		),
	).toEqual({
		kind: "ok",
		value: {
			catalogs: { claude: claudeCatalog },
			prefs: emptyPrefs,
			vault: emptyVault,
			version: 1,
		},
	});
});

test("parseHomeRuntimePack reads a valid catalogs record", () => {
	expect(parseHomeRuntimePack(packBody({ claude: claudeCatalogJson }))).toEqual(
		{
			kind: "ok",
			value: {
				catalogs: { claude: claudeCatalog },
				prefs: emptyPrefs,
				vault: emptyVault,
				version: 1,
			},
		},
	);
});
