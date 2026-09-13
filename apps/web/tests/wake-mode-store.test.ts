import { githubLogin } from "@hakasebot/core/domain.ts";
import { createD1VaultStore } from "@hakasebot/core/vault/store.ts";
import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { describe, expect, test } from "vitest";

import {
	parseSetRepoAutoAuthorsInput,
	parseSetRepoAutoReviewCadenceInput,
	parseSetRepoAutoBranchesInput,
	parseSetRepoWakeModeInput,
	setRepoAutoAuthors,
	setRepoAutoReviewCadence,
	setRepoAutoBranches,
	setRepoWakeMode,
} from "#/web-app/repos.server.ts";

import { FAKE_SESSION_COOKIE } from "./session-fixture.ts";

const USER = "42";
const repo = testRepoRef("talitha-tools/demo", "900001");

function vaultStore() {
	return createD1VaultStore(memoryD1());
}

async function enabledVaultStore() {
	const store = vaultStore();
	await store.enableRepo({ githubUserId: USER, repo });
	return store;
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

describe("repo wake mode storage", () => {
	test("enable and list return auto by default", async () => {
		const store = vaultStore();

		const enabled = await store.enableRepo({ githubUserId: USER, repo });
		const listed = await store.listEnabledRepos({ githubUserId: USER });

		expect(enabled).toMatchObject({
			kind: "ok",
			value: {
				autoAuthors: { scope: "you", skipLogins: [] },
				autoReviewCadence: "every-push",
				autoBranches: { branches: [], scope: "default", skipBranches: [] },
				wakeMode: "auto",
			},
		});
		expect(listed).toMatchObject({
			kind: "ok",
			value: [{ wakeMode: "auto" }],
		});
	});

	test("setRepoWakeMode persists and returns mention-only", async () => {
		const store = await enabledVaultStore();

		const updated = await store.setRepoWakeMode({
			githubUserId: USER,
			repo,
			wakeMode: "mention-only",
		});

		expect(updated).toMatchObject({
			kind: "ok",
			value: { wakeMode: "mention-only" },
		});
	});
});

describe("repo wake mode web app", () => {
	test("parses only supported wake modes", () => {
		expect(
			parseSetRepoWakeModeInput({
				repo: repo.id,
				wakeMode: "mention-only",
			}),
		).toMatchObject({
			kind: "ok",
			value: { wakeMode: "mention-only" },
		});
		expect(
			parseSetRepoWakeModeInput({
				repo: repo.id,
				wakeMode: "off",
			}),
		).toEqual({ kind: "invalid", message: "wake mode is invalid" });
	});

	test("updates the user's repo wake mode", async () => {
		const store = await enabledVaultStore();
		const updated = await setRepoWakeMode({
			...user(store),
			repoId: repo.id,
			wakeMode: "mention-only",
		});

		expect(updated).toMatchObject({
			kind: "ok",
			value: { repo, wakeMode: "mention-only" },
		});
	});
});

describe("repo auto review cadence storage", () => {
	test("setRepoAutoReviewCadence persists once-per-pr", async () => {
		const store = await enabledVaultStore();

		const updated = await store.setRepoAutoReviewCadence({
			autoReviewCadence: "once-per-pr",
			githubUserId: USER,
			repo,
		});

		expect(updated).toMatchObject({
			kind: "ok",
			value: { autoReviewCadence: "once-per-pr" },
		});
	});
});

describe("repo auto authors storage", () => {
	test("setRepoAutoAuthors persists friends scope and skip logins", async () => {
		const store = await enabledVaultStore();

		const updated = await store.setRepoAutoAuthors({
			autoAuthors: {
				scope: "friends",
				skipLogins: [must(githubLogin("thea"))],
			},
			githubUserId: USER,
			repo,
		});

		expect(updated).toMatchObject({
			kind: "ok",
			value: {
				autoAuthors: { scope: "friends", skipLogins: ["thea"] },
			},
		});
	});
});

describe("repo auto authors web app", () => {
	test("parses only supported auto author scopes", () => {
		expect(
			parseSetRepoAutoAuthorsInput({
				repo: repo.id,
				scope: "you",
				skipLogins: ["@Thea"],
			}),
		).toMatchObject({
			kind: "ok",
			value: {
				autoAuthors: { scope: "you", skipLogins: ["thea"] },
			},
		});
		expect(
			parseSetRepoAutoAuthorsInput({
				repo: repo.id,
				scope: "bots",
			}),
		).toEqual({ kind: "invalid", message: "auto authors is invalid" });
	});

	test("updates the user's repo auto authors", async () => {
		const store = await enabledVaultStore();
		const updated = await setRepoAutoAuthors({
			...user(store),
			autoAuthors: { scope: "you", skipLogins: [] },
			repoId: repo.id,
		});

		expect(updated).toMatchObject({
			kind: "ok",
			value: {
				autoAuthors: { scope: "you", skipLogins: [] },
				repo,
			},
		});
	});
});

describe("repo auto review cadence web app", () => {
	test("parses only supported auto review cadences", () => {
		expect(
			parseSetRepoAutoReviewCadenceInput({
				autoReviewCadence: "once-per-pr",
				repo: repo.id,
			}),
		).toMatchObject({
			kind: "ok",
			value: { autoReviewCadence: "once-per-pr" },
		});
		expect(
			parseSetRepoAutoReviewCadenceInput({
				autoReviewCadence: "always",
				repo: repo.id,
			}),
		).toEqual({ kind: "invalid", message: "auto review cadence is invalid" });
	});

	test("updates the user's repo auto review cadence", async () => {
		const store = await enabledVaultStore();
		const updated = await setRepoAutoReviewCadence({
			...user(store),
			autoReviewCadence: "once-per-pr",
			repoId: repo.id,
		});

		expect(updated).toMatchObject({
			kind: "ok",
			value: {
				autoReviewCadence: "once-per-pr",
				repo,
			},
		});
	});
});

describe("repo auto branches storage", () => {
	test("setRepoAutoBranches persists listed scope and branch lists", async () => {
		const store = await enabledVaultStore();

		const updated = await store.setRepoAutoBranches({
			autoBranches: {
				scope: "listed",
				branches: ["main", "release/*"],
				skipBranches: ["staging"],
			},
			githubUserId: USER,
			repo,
		});

		expect(updated).toMatchObject({
			kind: "ok",
			value: {
				autoBranches: {
					scope: "listed",
					branches: ["main", "release/*"],
					skipBranches: ["staging"],
				},
			},
		});
	});

	test("setRepoAutoBranches keys enabled repo by repo id not owner/name", async () => {
		const store = vaultStore();
		await store.enableRepo({ githubUserId: USER, repo });
		const renamedRepo = testRepoRef("renamed-org/renamed-repo", repo.id);
		const updated = await store.setRepoAutoBranches({
			autoBranches: {
				scope: "listed",
				branches: ["main"],
				skipBranches: [],
			},
			githubUserId: USER,
			repo: renamedRepo,
		});
		expect(updated).toMatchObject({
			kind: "ok",
			value: {
				repo: {
					id: renamedRepo.id,
					name: repo.name,
					owner: repo.owner,
				},
			},
		});
	});
});

describe("repo auto branches web app", () => {
	test("parses only supported auto branch scopes", () => {
		expect(
			parseSetRepoAutoBranchesInput({
				repo: "900001",
				scope: "default",
				skipBranches: ["staging"],
			}),
		).toMatchObject({
			kind: "ok",
			value: {
				autoBranches: {
					scope: "default",
					branches: [],
					skipBranches: ["staging"],
				},
			},
		});
		expect(
			parseSetRepoAutoBranchesInput({
				repo: "900001",
				scope: "listed",
				branches: ["main"],
			}),
		).toMatchObject({
			kind: "ok",
			value: {
				autoBranches: {
					scope: "listed",
					branches: ["main"],
					skipBranches: [],
				},
			},
		});
		expect(
			parseSetRepoAutoBranchesInput({
				repo: "900001",
				scope: "main",
			}),
		).toEqual({ kind: "invalid", message: "auto branches is invalid" });
	});

	test("updates the user's repo auto branches", async () => {
		const store = await enabledVaultStore();
		const updated = await setRepoAutoBranches({
			...user(store),
			autoBranches: { scope: "all", branches: [], skipBranches: [] },
			repoId: repo.id,
		});

		expect(updated).toMatchObject({
			kind: "ok",
			value: {
				autoBranches: { scope: "all", branches: [], skipBranches: [] },
				repo,
			},
		});
	});
});
