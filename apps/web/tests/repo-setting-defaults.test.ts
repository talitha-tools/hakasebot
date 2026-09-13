import { readFile } from "node:fs/promises";
import path from "node:path";

import { createD1VaultStore } from "@hakasebot/core/vault/store.ts";
import {
	parseRepoSettingDefaultsInput,
	productRepoSettingDefaults,
	repoSettingDefaultsFromRow,
} from "@hakasebot/core/wake/domain.ts";
import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { describe, expect, test } from "vitest";

import {
	getRepoSettingDefaults,
	parseSetRepoSettingDefaultsInput,
	setRepoSettingDefaults,
} from "#/web-app/repos.server.ts";

import { FAKE_SESSION_COOKIE } from "./session-fixture.ts";

const USER = "42";
const repo = testRepoRef("talitha-tools/demo", "900001");
const otherRepo = testRepoRef("talitha-tools/other", "900002");

function vaultStore() {
	return createD1VaultStore(memoryD1());
}

function user(store: ReturnType<typeof createD1VaultStore>) {
	return {
		cookieHeader: FAKE_SESSION_COOKIE,
		fetchGithubUser: async () => {
			await Promise.resolve();
			return {
				json: { id: Number(USER), login: "thea" },
				kind: "ok" as const,
			};
		},
		getAccessToken: async () => {
			await Promise.resolve();
			return { accessToken: "gho_test" };
		},
		store,
	};
}

describe("launch schema repo setting defaults", () => {
	test("defines repo_setting_defaults main options only", async () => {
		const sql = await readFile(
			path.join(import.meta.dirname, "..", "migrations", "0001_init.sql"),
			"utf8",
		);
		expect(sql).toContain("CREATE TABLE repo_setting_defaults");
		expect(sql).toContain("wake_mode");
		expect(sql).toContain("auto_authors");
		expect(sql).toContain("auto_branches");
		expect(sql).toContain("auto_review_cadence");
		const defaultsBlock = sql.slice(
			sql.indexOf("CREATE TABLE repo_setting_defaults"),
			sql.indexOf("CREATE TABLE home_repos"),
		);
		expect(defaultsBlock).not.toContain("auto_author_skip");
		expect(defaultsBlock).not.toContain("auto_branch_list");
		expect(defaultsBlock).not.toContain("review_prompt");
	});
});

describe("repo setting defaults domain", () => {
	test("product defaults match prior enable seeds", () => {
		expect(productRepoSettingDefaults()).toEqual({
			autoAuthorScope: "you",
			autoBranchScope: "default",
			autoReviewCadence: "every-push",
			wakeMode: "auto",
		});
	});

	test("corrupt row fields fall back per option", () => {
		expect(
			repoSettingDefaultsFromRow({
				autoAuthors: "nope",
				autoBranches: "listed",
				autoReviewCadence: "once-per-pr",
				wakeMode: "mention-only",
			}),
		).toEqual({
			autoAuthorScope: "you",
			autoBranchScope: "listed",
			autoReviewCadence: "once-per-pr",
			wakeMode: "mention-only",
		});
	});

	test("parse input rejects invalid wake mode", () => {
		expect(
			parseRepoSettingDefaultsInput({
				autoAuthorScope: "you",
				autoBranchScope: "default",
				autoReviewCadence: "every-push",
				wakeMode: "off",
			}),
		).toEqual({ kind: "invalid", message: "wake mode is invalid" });
	});
});

describe("repo setting defaults store", () => {
	test("get returns product defaults when no row", async () => {
		const store = vaultStore();
		await expect(
			store.getRepoSettingDefaults({ githubUserId: USER }),
		).resolves.toEqual({
			kind: "ok",
			value: productRepoSettingDefaults(),
		});
	});

	test("set persists and enable copies the main options", async () => {
		const store = vaultStore();
		const defaults = {
			autoAuthorScope: "friends" as const,
			autoBranchScope: "all" as const,
			autoReviewCadence: "once-per-pr" as const,
			wakeMode: "mention-only" as const,
		};

		await expect(
			store.setRepoSettingDefaults({ defaults, githubUserId: USER }),
		).resolves.toEqual({ kind: "ok", value: defaults });

		const enabled = await store.enableRepo({ githubUserId: USER, repo });
		expect(enabled).toMatchObject({
			kind: "ok",
			value: {
				autoAuthors: { scope: "friends", skipLogins: [] },
				autoBranches: { branches: [], scope: "all", skipBranches: [] },
				autoReviewCadence: "once-per-pr",
				wakeMode: "mention-only",
			},
		});
	});

	test("changing defaults does not rewrite existing enabled rows", async () => {
		const store = vaultStore();

		await store.enableRepo({ githubUserId: USER, repo });
		await store.setRepoSettingDefaults({
			defaults: {
				autoAuthorScope: "everyone",
				autoBranchScope: "listed",
				autoReviewCadence: "once-per-pr",
				wakeMode: "mention-only",
			},
			githubUserId: USER,
		});
		const second = await store.enableRepo({
			githubUserId: USER,
			repo: otherRepo,
		});
		const listed = await store.listEnabledRepos({ githubUserId: USER });

		expect(second).toMatchObject({
			kind: "ok",
			value: {
				autoAuthors: { scope: "everyone" },
				autoBranches: { scope: "listed" },
				autoReviewCadence: "once-per-pr",
				wakeMode: "mention-only",
			},
		});
		expect(listed).toMatchObject({
			kind: "ok",
			value: [
				{
					autoAuthors: { scope: "you" },
					autoBranches: { scope: "default" },
					autoReviewCadence: "every-push",
					repo: { id: repo.id },
					wakeMode: "auto",
				},
				{
					autoAuthors: { scope: "everyone" },
					autoBranches: { scope: "listed" },
					autoReviewCadence: "once-per-pr",
					repo: { id: otherRepo.id },
					wakeMode: "mention-only",
				},
			],
		});
	});
});

describe("repo setting defaults server", () => {
	test("parse and set round-trip through session deps", async () => {
		const store = vaultStore();
		const parsed = parseSetRepoSettingDefaultsInput({
			autoAuthorScope: "friends",
			autoBranchScope: "all",
			autoReviewCadence: "once-per-pr",
			wakeMode: "mention-only",
		});
		expect(parsed.kind).toBe("ok");
		if (parsed.kind !== "ok") {
			return;
		}
		const saved = await setRepoSettingDefaults({
			...user(store),
			defaults: parsed.value,
		});
		expect(saved).toEqual({ kind: "ok", value: parsed.value });
		const loaded = await getRepoSettingDefaults(user(store));
		expect(loaded).toEqual({ kind: "ok", value: parsed.value });
	});
});
