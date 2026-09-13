import { githubUserToken } from "@hakasebot/core/domain.ts";
import type { ParseResult } from "@hakasebot/core/domain.ts";
import type {
	EnabledRepoRow,
	VaultStore,
} from "@hakasebot/core/vault/store.ts";
import {
	defaultAutoAuthors,
	defaultAutoBranches,
	defaultAutoReviewCadence,
} from "@hakasebot/core/wake/domain.ts";
import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { DevUserOn } from "#/lib/dev-user.ts";
import { m as msg } from "#/paraglide/messages.js";
import { enablerWriteAccessFromSession } from "#/web-app/repos-context.server.ts";
import { enableRepo } from "#/web-app/repos.server.ts";

import { FAKE_SESSION_COOKIE } from "./session-fixture.ts";

vi.mock("cloudflare:workers", () => ({
	env: {
		get DB() {
			const db: unknown = Reflect.get(globalThis, "__enablerTestDb");
			return db;
		},
	},
}));

const repo = testRepoRef("talitha-tools/demo", "900201");
const token = must(githubUserToken("ghu_test"));

const devUser: DevUserOn = {
	github: { kind: "none" },
	githubUserId: "1",
	githubUserIdSource: "default",
	kind: "on",
	name: "hakase-dev",
};

async function grants(): Promise<ParseResult<undefined>> {
	await Promise.resolve();
	return { kind: "ok", value: undefined };
}

async function denies(): Promise<ParseResult<undefined>> {
	await Promise.resolve();
	return {
		kind: "invalid",
		message: "signed-in user cannot write this repository",
	};
}

async function apiError(): Promise<ParseResult<undefined>> {
	await Promise.resolve();
	return { kind: "invalid", message: "GitHub API 502" };
}

describe("enablerWriteAccessFromSession", () => {
	test("oauth user with write access passes", async () => {
		const result = await enablerWriteAccessFromSession({
			fetchWriteAccess: grants,
			repo,
			session: { kind: "oauth", token },
		});
		expect(result).toEqual({ kind: "ok", value: undefined });
	});

	test("oauth user without write access is rejected", async () => {
		const result = await enablerWriteAccessFromSession({
			fetchWriteAccess: denies,
			repo,
			session: { kind: "oauth", token },
		});
		expect(result).toEqual({
			kind: "invalid",
			message: "signed-in user cannot write this repository",
		});
	});

	test("fails closed on a github api error rather than opening the gate", async () => {
		const result = await enablerWriteAccessFromSession({
			fetchWriteAccess: apiError,
			repo,
			session: { kind: "oauth", token },
		});
		expect(result.kind).toBe("invalid");
	});

	test("loopback dev user without a token skips the check", async () => {
		let called = false;
		const result = await enablerWriteAccessFromSession({
			fetchWriteAccess: async () => {
				called = true;
				return grants();
			},
			repo,
			session: { kind: "dev", user: devUser },
		});
		expect(result).toEqual({ kind: "ok", value: undefined });
		expect(called).toBe(false);
	});

	test("dev user with a token is still checked against the real repo", async () => {
		const devWithToken: DevUserOn = {
			...devUser,
			github: { kind: "token", token },
		};
		const result = await enablerWriteAccessFromSession({
			fetchWriteAccess: denies,
			repo,
			session: { kind: "dev", user: devWithToken },
		});
		expect(result.kind).toBe("invalid");
	});

	test("missing session is rejected and never reaches the check", async () => {
		let called = false;
		const result = await enablerWriteAccessFromSession({
			fetchWriteAccess: async () => {
				called = true;
				return grants();
			},
			repo,
			session: { kind: "missing" },
		});
		expect(result.kind).toBe("invalid");
		expect(called).toBe(false);
	});
});

const USER = "42";

function sessionDeps(store: VaultStore) {
	return {
		cookieHeader: FAKE_SESSION_COOKIE,
		fetchGithubUser: async () => {
			await Promise.resolve();
			return { json: { id: Number(USER), login: "thea" }, kind: "ok" as const };
		},
		getAccessToken: async () => {
			await Promise.resolve();
			return { accessToken: "ghu_test" };
		},
		store,
	};
}

function notImplemented(): never {
	throw new Error("not implemented");
}

/** A VaultStore whose only live methods are those the enable path touches. */
function enableTrackingStore(): VaultStore & { enableCalls: number } {
	const enabledRow: EnabledRepoRow = {
		autoAuthors: defaultAutoAuthors(),
		autoBranches: defaultAutoBranches(),
		autoReviewCadence: defaultAutoReviewCadence(),
		botAt: undefined,
		homeAt: undefined,
		lastSyncedAt: undefined,
		repo,
		syncedEpoch: 0,
		wakeMode: "auto",
	};
	const store = {
		enableCalls: 0,
		async countAccounts() {
			await Promise.resolve();
			return { kind: "ok" as const, value: 0 };
		},
		async enableRepo() {
			await Promise.resolve();
			store.enableCalls += 1;
			return { kind: "ok" as const, value: enabledRow };
		},
		async readVaultEpoch() {
			await Promise.resolve();
			return { kind: "ok" as const, value: 1 };
		},
		clearRepoModelList: notImplemented,
		deleteAccount: notImplemented,
		deleteModelSlot: notImplemented,
		disableRepo: notImplemented,
		getAccount: notImplemented,
		getFirstSealedAccount: notImplemented,
		getRepoSettingDefaults: notImplemented,
		listAccounts: notImplemented,
		listEnabledRepos: notImplemented,
		listModelSlots: notImplemented,
		listSlotsForRepo: notImplemented,
		markHomeDispatcherAt: notImplemented,
		markRepoBotAt: notImplemented,
		markRepoSynced: notImplemented,
		previewRotateVault: notImplemented,
		rotateVault: notImplemented,
		saveAccount: notImplemented,
		saveModelSlot: notImplemented,
		setDefaultSlotOrder: notImplemented,
		setRepoAutoAuthors: notImplemented,
		setRepoAutoBranches: notImplemented,
		setRepoAutoReviewCadence: notImplemented,
		setRepoModelList: notImplemented,
		setRepoReviewInstructions: notImplemented,
		setRepoSettingDefaults: notImplemented,
		setRepoWakeMode: notImplemented,
	};
	return store;
}

describe("enableRepo write-access gate", () => {
	let restoreFetch: (() => void) | undefined;

	afterEach(() => {
		restoreFetch?.();
		restoreFetch = undefined;
		Reflect.deleteProperty(globalThis, "__enablerTestDb");
	});

	test("rejects and never writes the enabled repo when the user cannot write it", async () => {
		restoreFetch = installGithubFetchMock({
			getRepo: () => ({ json: { permissions: { push: false } } }),
		});
		const store = enableTrackingStore();
		const result = await enableRepo({ ...sessionDeps(store), repo });
		expect(result.kind).toBe("invalid");
		expect(store.enableCalls).toBe(0);
	});

	test("rejects and never writes when D1 is missing", async () => {
		restoreFetch = installGithubFetchMock({
			getRepo: () => ({ json: { permissions: { push: true } } }),
		});
		const store = enableTrackingStore();
		const result = await enableRepo({ ...sessionDeps(store), repo });
		expect(result).toEqual({
			kind: "invalid",
			message: msg.store_unbound(),
		});
		expect(store.enableCalls).toBe(0);
	});

	test("enables the repo when the user has write access", async () => {
		Reflect.set(globalThis, "__enablerTestDb", memoryD1());
		restoreFetch = installGithubFetchMock({
			getRepo: () => ({ json: { permissions: { push: true } } }),
		});
		const store = enableTrackingStore();
		const result = await enableRepo({ ...sessionDeps(store), repo });
		expect(result.kind).toBe("ok");
		expect(store.enableCalls).toBe(1);
	});
});
