import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { describe, expect, test } from "vitest";

import type { AccountDeletionStore } from "#/web-app/account-deletion-store.ts";
import {
	deleteAccount,
	previewAccountDeletion,
} from "#/web-app/account-deletion.server.ts";

import { FAKE_SESSION_COOKIE } from "./session-fixture.ts";

const USER = "42";
const home = testRepoRef("user/review-home", "1");

function deletionStore(
	overrides: Partial<AccountDeletionStore> = {},
): AccountDeletionStore {
	return {
		deleteAccount: async () => {
			await Promise.resolve();
			return { kind: "ok" as const, value: undefined };
		},
		previewAccountDeletion: async () => {
			await Promise.resolve();
			return {
				kind: "ok" as const,
				value: {
					enabledRepoCount: 1,
					homeRepo: home,
					modelSlotCount: 2,
					repoClaimCount: 1,
					vaultAccountCount: 3,
					wakeRunCount: 4,
				},
			};
		},
		...overrides,
	};
}

function sessionDeps(store: AccountDeletionStore) {
	return {
		cookieHeader: FAKE_SESSION_COOKIE,
		deletionStore: store,
		fetchGithubUser: async () => {
			await Promise.resolve();
			return {
				kind: "ok" as const,
				json: { id: Number(USER), login: "thea" },
			};
		},
		getAccessToken: async () => {
			await Promise.resolve();
			return { accessToken: "gho_test" };
		},
		store: {
			countAccounts: async () => {
				await Promise.resolve();
				return { kind: "ok" as const, value: 0 };
			},
			getFirstSealedAccount: async () => {
				await Promise.resolve();
				return { kind: "ok" as const, value: undefined };
			},
			readVaultEpoch: async () => {
				await Promise.resolve();
				return { kind: "ok" as const, value: 1 };
			},
		},
	};
}

describe("account deletion server", () => {
	test("previewAccountDeletion returns store preview for session user", async () => {
		const preview = await previewAccountDeletion(sessionDeps(deletionStore()));
		expect(preview.kind).toBe("ok");
		if (preview.kind !== "ok") {
			return;
		}
		expect(preview.value.vaultAccountCount).toBe(3);
		expect(preview.value.homeRepo).toEqual(home);
	});

	test("deleteAccount calls store wipe", async () => {
		let wiped: string | undefined;
		const result = await deleteAccount(
			sessionDeps(
				deletionStore({
					deleteAccount: async (args) => {
						wiped = args.githubUserId;
						await Promise.resolve();
						return { kind: "ok" as const, value: undefined };
					},
				}),
			),
		);
		expect(result).toEqual({ kind: "ok", value: undefined });
		expect(wiped).toBe(USER);
	});
});
