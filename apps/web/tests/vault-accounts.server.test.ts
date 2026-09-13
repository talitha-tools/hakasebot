import {
	encryptCredential,
	generateEncryptionKey,
} from "@hakasebot/core/vault/crypto.ts";
import type { VaultAccountMeta } from "@hakasebot/core/vault/domain.ts";
import { newAccountId } from "@hakasebot/core/vault/domain.ts";
import type { VaultStore } from "@hakasebot/core/vault/store.ts";
import { describe, expect, test } from "vitest";

import { m as msg } from "#/paraglide/messages.js";
import {
	deleteVaultAccount,
	listVaultAccounts,
	parseDeleteAccountInput,
	parseSaveSealedAccountInput,
	saveVaultAccount,
} from "#/web-app/accounts.server.ts";

import { FAKE_SESSION_COOKIE } from "./session-fixture.ts";

const USER = "42";

function sessionDeps(store: VaultStore) {
	return {
		cookieHeader: FAKE_SESSION_COOKIE,
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
		store,
	};
}

function mockStore(rows: { accounts: VaultAccountMeta[] }): VaultStore {
	return {
		async countAccounts() {
			await Promise.resolve();
			return { kind: "ok" as const, value: rows.accounts.length };
		},
		async deleteAccount(args) {
			await Promise.resolve();
			const index = rows.accounts.findIndex((row) => row.id === args.id);
			if (index === -1) {
				return {
					kind: "invalid" as const,
					message: "vault account not found",
				};
			}
			rows.accounts.splice(index, 1);
			return { kind: "ok" as const, value: undefined };
		},
		deleteModelSlot() {
			throw new Error("not implemented");
		},
		getAccount() {
			throw new Error("not implemented");
		},
		async getFirstSealedAccount() {
			await Promise.resolve();
			return { kind: "ok" as const, value: undefined };
		},
		async listAccounts() {
			await Promise.resolve();
			return { kind: "ok" as const, value: [...rows.accounts] };
		},
		listModelSlots() {
			throw new Error("not implemented");
		},
		listSlotsForRepo() {
			throw new Error("not implemented");
		},
		async readVaultEpoch() {
			await Promise.resolve();
			return { kind: "ok" as const, value: undefined };
		},
		async saveAccount(args) {
			await Promise.resolve();
			const meta: VaultAccountMeta = {
				createdAt: Date.now(),
				engine: args.engine,
				id: args.sealed.accountId,
				label: args.label,
			};
			rows.accounts.push(meta);
			return { kind: "ok" as const, value: meta };
		},
		saveModelSlot() {
			throw new Error("not implemented");
		},
		setDefaultSlotOrder() {
			throw new Error("not implemented");
		},
		setRepoModelList() {
			throw new Error("not implemented");
		},
		setRepoReviewInstructions() {
			throw new Error("not implemented");
		},
		clearRepoModelList() {
			throw new Error("not implemented");
		},
		enableRepo() {
			throw new Error("not implemented");
		},
		getRepoSettingDefaults() {
			throw new Error("not implemented");
		},
		setRepoSettingDefaults() {
			throw new Error("not implemented");
		},
		disableRepo() {
			throw new Error("not implemented");
		},
		setRepoWakeMode() {
			throw new Error("not implemented");
		},
		setRepoAutoAuthors() {
			throw new Error("not implemented");
		},
		setRepoAutoBranches() {
			throw new Error("not implemented");
		},
		setRepoAutoReviewCadence() {
			throw new Error("not implemented");
		},
		async listEnabledRepos() {
			await Promise.resolve();
			return { kind: "ok" as const, value: [] };
		},
		markHomeDispatcherAt() {
			throw new Error("not implemented");
		},
		markRepoBotAt() {
			throw new Error("not implemented");
		},
		markRepoSynced() {
			throw new Error("not implemented");
		},
		previewRotateVault() {
			throw new Error("not implemented");
		},
		rotateVault() {
			throw new Error("not implemented");
		},
	};
}

describe("vault accounts server", () => {
	test("parseSaveSealedAccountInput rejects incomplete sealed payload", () => {
		expect(
			parseSaveSealedAccountInput({
				engine: "claude",
				label: "work",
				sealed: {
					accountId: newAccountId(),
					ciphertext: "",
					iv: "aXZpdml2aXZpdml2",
				},
			}),
		).toEqual({
			kind: "invalid",
			message: msg.accounts_sealed_incomplete(),
		});
	});

	test("listVaultAccounts uses session github user id only", async () => {
		const store = mockStore({ accounts: [] });
		const listed = await listVaultAccounts(sessionDeps(store));
		expect(listed).toEqual({ kind: "ok", value: [] });
	});

	test("saveVaultAccount accepts sealed ciphertext only", async () => {
		const encryptionKey = generateEncryptionKey();
		const accountId = newAccountId();
		const sealed = await encryptCredential({
			accountId,
			plaintext: "never-on-server",
			encryptionKey,
		});
		const parsed = parseSaveSealedAccountInput({
			engine: "claude",
			label: "work",
			sealed,
		});
		expect(parsed.kind).toBe("ok");
		if (parsed.kind !== "ok") {
			return;
		}
		const store = mockStore({ accounts: [] });
		const saved = await saveVaultAccount({
			...sessionDeps(store),
			input: parsed.value,
			store,
		});
		expect(saved.kind).toBe("ok");
		if (saved.kind !== "ok") {
			return;
		}
		expect(saved.value.label).toBe("work");
		expect(JSON.stringify(parsed.value)).not.toMatch(/never-on-server/u);
	});

	test("deleteVaultAccount removes by parsed id", async () => {
		const id = newAccountId();
		const store = mockStore({
			accounts: [
				{
					createdAt: 1,
					engine: "claude",
					id,
					label: "gone",
				},
			],
		});
		const parsed = parseDeleteAccountInput({ id });
		expect(parsed.kind).toBe("ok");
		if (parsed.kind !== "ok") {
			return;
		}
		const deleted = await deleteVaultAccount({
			...sessionDeps(store),
			id: parsed.value,
			store,
		});
		expect(deleted).toEqual({ kind: "ok", value: undefined });
		await expect(listVaultAccounts(sessionDeps(store))).resolves.toEqual({
			kind: "ok",
			value: [],
		});
	});
});
