import { parseRepoRef } from "@hakasebot/core/domain.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { describe, expect, test } from "vitest";

import {
	buildWebAppSearch,
	webAppSearchToParams,
	defaultTab,
	parseWebAppSearch,
	resolveTab,
	visibleTabs,
} from "#/web-app/search.ts";

const DEMO_REPO = must(parseRepoRef("talitha-tools/demo"));

describe("visibleTabs", () => {
	test("includes onboarding until a repo syncs", () => {
		expect(visibleTabs({ hasSyncedRepo: false })).toContain("onboarding");
	});

	test("drops onboarding after first synced repo", () => {
		expect(visibleTabs({ hasSyncedRepo: true })).not.toContain("onboarding");
	});
});

describe("resolveTab", () => {
	test("falls back to onboarding when visible and tab is missing", () => {
		const visible = visibleTabs({ hasSyncedRepo: false });
		expect(resolveTab({ requested: undefined, visible })).toBe("onboarding");
	});

	test("falls back to accounts when onboarding is hidden", () => {
		const visible = visibleTabs({ hasSyncedRepo: true });
		expect(resolveTab({ requested: undefined, visible })).toBe("accounts");
	});

	test("rejects stale onboarding tab after first sync", () => {
		const visible = visibleTabs({ hasSyncedRepo: true });
		expect(resolveTab({ requested: "onboarding", visible })).toBe("accounts");
	});
});

describe("parseWebAppSearch", () => {
	test("parses repos tab with repo and install", () => {
		const params = new URLSearchParams(
			"tab=repos&repo=talitha-tools/demo&install=sync",
		);
		expect(parseWebAppSearch(params, { hasSyncedRepo: false })).toEqual({
			install: "sync",
			repo: DEMO_REPO,
			tab: "repos",
			view: undefined,
		});
	});

	test("parses defaults view and clears repo params", () => {
		const params = new URLSearchParams(
			"tab=repos&view=defaults&repo=talitha-tools/demo&install=bot",
		);
		expect(parseWebAppSearch(params, { hasSyncedRepo: false })).toEqual({
			install: undefined,
			repo: undefined,
			tab: "repos",
			view: "defaults",
		});
	});

	test("does not accept poster as an install step", () => {
		const params = new URLSearchParams(
			"tab=repos&repo=talitha-tools/demo&install=poster",
		);
		expect(parseWebAppSearch(params, { hasSyncedRepo: false }).install).toBe(
			undefined,
		);
	});

	test("accepts secret_sync alias for install step", () => {
		const params = new URLSearchParams(
			"tab=repos&repo=talitha-tools/demo&install=secret_sync",
		);
		expect(parseWebAppSearch(params, { hasSyncedRepo: false }).install).toBe(
			"sync",
		);
	});

	test("strips invalid tab without breaking shell defaults", () => {
		const params = new URLSearchParams("tab=nope");
		expect(parseWebAppSearch(params, { hasSyncedRepo: false }).tab).toBe(
			defaultTab(visibleTabs({ hasSyncedRepo: false })),
		);
	});

	test("strips invalid repo and install on repos tab", () => {
		const params = new URLSearchParams(
			"tab=repos&repo=not-a-repo&install=nope",
		);
		expect(parseWebAppSearch(params, { hasSyncedRepo: false })).toEqual({
			install: undefined,
			repo: undefined,
			tab: "repos",
			view: undefined,
		});
	});

	test("ignores repo params outside repos tab", () => {
		const params = new URLSearchParams(
			"tab=accounts&repo=talitha-tools/demo&install=sync&view=defaults",
		);
		expect(parseWebAppSearch(params, { hasSyncedRepo: false })).toEqual({
			install: undefined,
			repo: undefined,
			tab: "accounts",
			view: undefined,
		});
	});
});

describe("buildWebAppSearch", () => {
	test("round-trips canonical search params", () => {
		const parsed = parseWebAppSearch(
			new URLSearchParams("tab=repos&repo=talitha-tools/demo&install=bot"),
			{ hasSyncedRepo: true },
		);
		const built = buildWebAppSearch(parsed);
		expect(built).toEqual({
			install: "bot",
			repo: "talitha-tools/demo",
			tab: "repos",
			view: undefined,
		});
		expect(
			parseWebAppSearch(webAppSearchToParams(parsed), {
				hasSyncedRepo: true,
			}),
		).toEqual(parsed);
	});

	test("round-trips defaults view", () => {
		const parsed = parseWebAppSearch(
			new URLSearchParams("tab=repos&view=defaults"),
			{ hasSyncedRepo: true },
		);
		expect(buildWebAppSearch(parsed)).toEqual({
			install: undefined,
			repo: undefined,
			tab: "repos",
			view: "defaults",
		});
		expect(
			parseWebAppSearch(webAppSearchToParams(parsed), {
				hasSyncedRepo: true,
			}),
		).toEqual(parsed);
	});
});
