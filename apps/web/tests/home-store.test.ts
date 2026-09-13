import { d1Bindable } from "@hakasebot/core/d1.ts";
import { createAppDb } from "@hakasebot/core/db/client.ts";
import type { D1DatabaseLike } from "@hakasebot/core/vault/store.ts";
import { createD1VaultStore } from "@hakasebot/core/vault/store.ts";
import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { describe, expect, test } from "vitest";

import { createRouteStore } from "#/home/route-store.ts";
import { createHomeStore } from "#/home/store.ts";

const repo = testRepoRef("talitha-tools/demo", "900001");
const octoDemo = testRepoRef("octo/demo", "920001");
const octoMine = testRepoRef("octo/mine", "920002");
const octoTheirs = testRepoRef("octo/theirs", "920003");
const octoBadPull = testRepoRef("octo/bad-pull", "920004");
const octoBadRun = testRepoRef("octo/bad-run", "920005");

interface SeededHome {
	db: D1DatabaseLike;
	routes: ReturnType<typeof createRouteStore>;
	store: ReturnType<typeof createHomeStore>;
	vault: ReturnType<typeof createD1VaultStore>;
}

function seededHome(): SeededHome {
	const db = memoryD1();
	return {
		db,
		routes: createRouteStore(createAppDb(db)),
		store: createHomeStore(db),
		vault: createD1VaultStore(db),
	};
}

async function insertWakeRow(args: {
	createdAt: number;
	db: D1DatabaseLike;
	key: string;
	pullNumber: number;
	repo: ReturnType<typeof testRepoRef>;
	runUrl: string | undefined;
	status: string;
}): Promise<void> {
	await args.db
		.prepare(
			`INSERT INTO wake_runs (
        wake_key, dispatch_id, consumer_repo_id, consumer_owner, consumer_name,
        pull_number, run_url, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.bind(
			args.key,
			`dispatch-${args.key}`,
			args.repo.id,
			args.repo.owner,
			args.repo.name,
			args.pullNumber,
			d1Bindable(args.runUrl),
			args.status,
			args.createdAt,
		)
		.run();
}

async function routedRepo(args: {
	githubUserId: string;
	home: SeededHome;
	repo: ReturnType<typeof testRepoRef>;
}): Promise<void> {
	await args.home.vault.enableRepo({
		githubUserId: args.githubUserId,
		repo: args.repo,
	});
	await args.home.routes.claimRoute({
		githubUserId: args.githubUserId,
		now: 1,
		repo: args.repo,
	});
}

async function claimedOnly(args: {
	githubUserId: string;
	home: SeededHome;
	repo: ReturnType<typeof testRepoRef>;
}): Promise<ReturnType<typeof createHomeStore>> {
	await args.home.routes.claimRoute({
		githubUserId: args.githubUserId,
		now: 1,
		repo: args.repo,
	});
	return args.home.store;
}

async function routedWithOverrides(args: {
	autoAuthors?: string;
	autoBranchList?: string;
	autoBranches?: string;
	wakeMode?: string;
}): Promise<ReturnType<typeof createHomeStore>> {
	const home = seededHome();
	await routedRepo({ githubUserId: "42", home, repo });
	await home.db
		.prepare(
			`UPDATE enabled_repos
       SET wake_mode = COALESCE(?, wake_mode),
           auto_authors = COALESCE(?, auto_authors),
           auto_branches = COALESCE(?, auto_branches),
           auto_branch_list = COALESCE(?, auto_branch_list)
       WHERE github_user_id = ? AND repo_id = ?`,
		)
		.bind(
			d1Bindable(args.wakeMode),
			d1Bindable(args.autoAuthors),
			d1Bindable(args.autoBranches),
			d1Bindable(args.autoBranchList),
			"42",
			repo.id,
		)
		.run();
	return home.store;
}

describe("createHomeStore listLastWakes", () => {
	test("returns the latest wake for each enabled repo", async () => {
		const home = seededHome();
		await routedRepo({ githubUserId: "user-1", home, repo: octoDemo });
		await insertWakeRow({
			createdAt: 100,
			db: home.db,
			key: "octo/demo#4@old",
			pullNumber: 4,
			repo: octoDemo,
			runUrl: undefined,
			status: "queued",
		});
		await insertWakeRow({
			createdAt: 200,
			db: home.db,
			key: "octo/demo#5@new",
			pullNumber: 5,
			repo: octoDemo,
			runUrl: "https://github.com/octo/home/actions/runs/1",
			status: "dispatched",
		});

		await expect(
			home.store.listLastWakes({ githubUserId: "user-1" }),
		).resolves.toEqual({
			kind: "ok",
			value: {
				[octoDemo.id]: {
					createdAt: 200,
					pullNumber: 5,
					runUrl: "https://github.com/octo/home/actions/runs/1",
					status: "dispatched",
				},
			},
		});
	});

	test("does not return a consumer routed to another user", async () => {
		const home = seededHome();
		await routedRepo({ githubUserId: "user-1", home, repo: octoMine });
		await home.vault.enableRepo({
			githubUserId: "user-1",
			repo: octoTheirs,
		});
		await home.routes.claimRoute({
			githubUserId: "user-2",
			now: 1,
			repo: octoTheirs,
		});
		await insertWakeRow({
			createdAt: 100,
			db: home.db,
			key: "octo/mine#1",
			pullNumber: 1,
			repo: octoMine,
			runUrl: undefined,
			status: "queued",
		});
		await insertWakeRow({
			createdAt: 200,
			db: home.db,
			key: "octo/theirs#2",
			pullNumber: 2,
			repo: octoTheirs,
			runUrl: undefined,
			status: "failed",
		});

		const result = await home.store.listLastWakes({
			githubUserId: "user-1",
		});
		expect(result).toEqual({
			kind: "ok",
			value: {
				[octoMine.id]: {
					createdAt: 100,
					pullNumber: 1,
					runUrl: undefined,
					status: "queued",
				},
			},
		});
	});

	test("drops wakes with invalid pull numbers or run URLs", async () => {
		const home = seededHome();
		await routedRepo({ githubUserId: "user-1", home, repo: octoBadPull });
		await routedRepo({ githubUserId: "user-1", home, repo: octoBadRun });
		await insertWakeRow({
			createdAt: 100,
			db: home.db,
			key: "octo/bad-pull#0",
			pullNumber: 0,
			repo: octoBadPull,
			runUrl: undefined,
			status: "queued",
		});
		await insertWakeRow({
			createdAt: 200,
			db: home.db,
			key: "octo/bad-run#2",
			pullNumber: 2,
			repo: octoBadRun,
			runUrl: "",
			status: "dispatched",
		});

		await expect(
			home.store.listLastWakes({ githubUserId: "user-1" }),
		).resolves.toEqual({ kind: "ok", value: {} });
	});

	test("returns an empty map when enabled repos have no wakes", async () => {
		const home = seededHome();
		await routedRepo({ githubUserId: "user-1", home, repo: octoDemo });

		await expect(
			home.store.listLastWakes({ githubUserId: "user-1" }),
		).resolves.toEqual({ kind: "ok", value: {} });
	});
});

describe("createHomeStore findRoute wake mode", () => {
	test("is disabled when the claim has no enabled row", async () => {
		const store = await claimedOnly({
			githubUserId: "42",
			home: seededHome(),
			repo,
		});
		const found = await store.findRoute(repo.id);

		expect(found).toMatchObject({
			kind: "ok",
			value: { enabled: false },
		});
	});

	test("defaults a null wake mode to auto", async () => {
		const home = seededHome();
		await routedRepo({ githubUserId: "42", home, repo });
		const found = await home.store.findRoute(repo.id);

		expect(found).toMatchObject({
			kind: "ok",
			value: { enabled: true, wakeMode: "auto" },
		});
	});

	test("rejects a corrupt wake mode", async () => {
		const store = await routedWithOverrides({ wakeMode: "off" });
		const found = await store.findRoute(repo.id);

		expect(found).toEqual({ kind: "invalid", message: "wake mode is invalid" });
	});
});

describe("createHomeStore findRoute auto authors", () => {
	test("defaults a null auto authors scope to you", async () => {
		const home = seededHome();
		await routedRepo({ githubUserId: "42", home, repo });
		const found = await home.store.findRoute(repo.id);

		expect(found).toMatchObject({
			kind: "ok",
			value: {
				autoAuthors: { scope: "you", skipLogins: [] },
				userGithubUserId: "42",
			},
		});
	});

	test("aliases stored anyone team outsiders scopes", async () => {
		const anyone = await routedWithOverrides({ autoAuthors: "anyone" });
		await expect(anyone.findRoute(repo.id)).resolves.toMatchObject({
			kind: "ok",
			value: { autoAuthors: { scope: "you", skipLogins: [] } },
		});
		const team = await routedWithOverrides({ autoAuthors: "team" });
		await expect(team.findRoute(repo.id)).resolves.toMatchObject({
			kind: "ok",
			value: { autoAuthors: { scope: "friends", skipLogins: [] } },
		});
		const outsiders = await routedWithOverrides({ autoAuthors: "outsiders" });
		await expect(outsiders.findRoute(repo.id)).resolves.toMatchObject({
			kind: "ok",
			value: { autoAuthors: { scope: "everyone", skipLogins: [] } },
		});
	});

	test("falls back to you when auto authors is corrupt so mentions still run", async () => {
		const store = await routedWithOverrides({ autoAuthors: "bots" });
		const found = await store.findRoute(repo.id);

		expect(found).toMatchObject({
			kind: "ok",
			value: {
				autoAuthors: { scope: "you", skipLogins: [] },
			},
		});
	});
});

describe("createHomeStore findRoute auto branches", () => {
	test("defaults a null auto branches scope to default branch", async () => {
		const home = seededHome();
		await routedRepo({ githubUserId: "42", home, repo });
		const found = await home.store.findRoute(repo.id);

		expect(found).toMatchObject({
			kind: "ok",
			value: {
				autoBranches: { branches: [], scope: "default", skipBranches: [] },
			},
		});
	});

	test("falls back to default branch when auto branches is corrupt", async () => {
		const store = await routedWithOverrides({
			autoBranchList: "not-json",
			autoBranches: "default",
		});
		const found = await store.findRoute(repo.id);

		expect(found).toMatchObject({
			kind: "ok",
			value: {
				autoBranches: { branches: [], scope: "default", skipBranches: [] },
			},
		});
	});
});
