import { modelName } from "@hakasebot/core/domain.ts";
import {
	encryptCredential,
	generateEncryptionKey,
} from "@hakasebot/core/vault/crypto.ts";
import type {
	SealedCredential,
	VaultAccountMeta,
} from "@hakasebot/core/vault/domain.ts";
import { newAccountId, newModelSlotId } from "@hakasebot/core/vault/domain.ts";
import type { ModelSlot } from "@hakasebot/core/vault/model-slot.ts";
import type { VaultStore } from "@hakasebot/core/vault/store.ts";
import { describe, expect, test } from "vitest";

import {
	deleteModelSlot,
	getVaultAccountSealed,
	listModelSlots,
	parseDeleteModelSlotInput,
	parseSaveModelSlotInput,
	parseSetDefaultSlotOrderInput,
	saveModelSlot,
	setDefaultModelSlotOrder,
} from "#/web-app/slots.server.ts";

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

function mockStore(rows: {
	accounts: VaultAccountMeta[];
	slots: ModelSlot[];
	sealed: Map<string, SealedCredential>;
}): VaultStore {
	return {
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
		async countAccounts() {
			await Promise.resolve();
			return { kind: "ok" as const, value: rows.accounts.length };
		},
		deleteAccount() {
			throw new Error("not implemented");
		},
		async deleteModelSlot(args) {
			await Promise.resolve();
			const index = rows.slots.findIndex((slot) => slot.id === args.id);
			if (index === -1) {
				return {
					kind: "invalid" as const,
					message: "model slot not found",
				};
			}
			rows.slots.splice(index, 1);
			return { kind: "ok" as const, value: undefined };
		},
		async getAccount(args) {
			await Promise.resolve();
			const account = rows.accounts.find((row) => row.id === args.id);
			if (account === undefined) {
				return {
					kind: "invalid" as const,
					message: "vault account not found",
				};
			}
			const sealed = rows.sealed.get(account.id);
			if (sealed === undefined) {
				return {
					kind: "invalid" as const,
					message: "sealed account row is incomplete",
				};
			}
			return {
				kind: "ok" as const,
				value: {
					...account,
					githubUserId: USER,
					sealed: {
						accountId: account.id,
						ciphertext: sealed.ciphertext,
						iv: sealed.iv,
					},
				},
			};
		},
		async getFirstSealedAccount() {
			await Promise.resolve();
			return { kind: "ok" as const, value: undefined };
		},
		async listAccounts() {
			await Promise.resolve();
			return { kind: "ok" as const, value: [...rows.accounts] };
		},
		async listModelSlots() {
			await Promise.resolve();
			return {
				kind: "ok" as const,
				value: [...rows.slots].toSorted(
					(left, right) => left.defaultSortIndex - right.defaultSortIndex,
				),
			};
		},
		listSlotsForRepo() {
			throw new Error("not implemented");
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
		async readVaultEpoch() {
			await Promise.resolve();
			return { kind: "ok" as const, value: undefined };
		},
		saveAccount() {
			throw new Error("not implemented");
		},
		async saveModelSlot(args) {
			await Promise.resolve();
			const parsed = parseSaveModelSlotInput({
				accountId: args.accountId,
				defaultSortIndex: args.defaultSortIndex,
				engine: args.engine,
				label: args.label,
				model: args.model,
				...(args.fast === undefined ? {} : { fast: args.fast }),
				...(args.similarModel === undefined
					? {}
					: { similarModel: args.similarModel }),
				...(args.effort === undefined ? {} : { effort: args.effort }),
				...(args.slotId === undefined ? {} : { slotId: args.slotId }),
			});
			if (parsed.kind === "invalid") {
				return parsed;
			}
			const slot: ModelSlot = {
				accountId: parsed.value.accountId,
				createdAt: Date.now(),
				defaultSortIndex: parsed.value.defaultSortIndex,
				engine: parsed.value.engine,
				fast: parsed.value.fast ?? false,
				id: parsed.value.slotId ?? newModelSlotId(),
				label: parsed.value.label,
				model: parsed.value.model,
				similarModel: parsed.value.similarModel ?? true,
				...(parsed.value.effort === undefined
					? {}
					: { effort: parsed.value.effort }),
			};
			rows.slots.push(slot);
			return { kind: "ok" as const, value: slot };
		},
		async setDefaultSlotOrder(args) {
			await Promise.resolve();
			for (const [index, slotId] of args.orderedSlotIds.entries()) {
				const slot = rows.slots.find((item) => item.id === slotId);
				if (slot !== undefined) {
					slot.defaultSortIndex = index;
				}
			}
			return {
				kind: "ok" as const,
				value: [...rows.slots].toSorted(
					(left, right) => left.defaultSortIndex - right.defaultSortIndex,
				),
			};
		},
		setRepoModelList() {
			throw new Error("not implemented");
		},
		setRepoReviewInstructions() {
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

describe("model slots server", () => {
	test("parseSaveModelSlotInput rejects empty label", () => {
		expect(
			parseSaveModelSlotInput({
				accountId: newAccountId(),
				defaultSortIndex: 0,
				engine: "claude",
				label: "   ",
				model: "claude-opus-5",
			}),
		).toEqual({
			kind: "invalid",
			message: "model slot label is empty",
		});
	});

	test("listModelSlots uses session github user id only", async () => {
		const store = mockStore({
			accounts: [],
			sealed: new Map(),
			slots: [],
		});
		const listed = await listModelSlots(sessionDeps(store));
		expect(listed).toEqual({ kind: "ok", value: [] });
	});

	test("saveModelSlot stores config without secrets", async () => {
		const accountId = newAccountId();
		const parsedModel = modelName("claude-opus-5");
		if (parsedModel.kind === "invalid") {
			throw new Error(parsedModel.message);
		}
		const parsed = parseSaveModelSlotInput({
			accountId,
			defaultSortIndex: 0,
			engine: "claude",
			fast: true,
			label: "opus",
			model: parsedModel.value,
		});
		expect(parsed.kind).toBe("ok");
		if (parsed.kind !== "ok") {
			return;
		}
		const store = mockStore({
			accounts: [
				{
					createdAt: 1,
					engine: "claude",
					id: accountId,
					label: "work",
				},
			],
			sealed: new Map(),
			slots: [],
		});
		const saved = await saveModelSlot({
			...sessionDeps(store),
			input: parsed.value,
			store,
		});
		expect(saved.kind).toBe("ok");
		if (saved.kind !== "ok") {
			return;
		}
		expect(saved.value.fast).toBe(true);
		expect(JSON.stringify(saved.value)).not.toMatch(/sk-/u);
	});

	test("setDefaultModelSlotOrder reorders slots", async () => {
		const first = newModelSlotId();
		const second = newModelSlotId();
		const parsedModel = modelName("claude-opus-5");
		if (parsedModel.kind === "invalid") {
			throw new Error(parsedModel.message);
		}
		const store = mockStore({
			accounts: [],
			sealed: new Map(),
			slots: [
				{
					accountId: newAccountId(),
					createdAt: 1,
					defaultSortIndex: 0,
					engine: "claude",
					fast: false,
					id: first,
					label: "a",
					model: parsedModel.value,
					similarModel: true,
				},
				{
					accountId: newAccountId(),
					createdAt: 2,
					defaultSortIndex: 1,
					engine: "claude",
					fast: false,
					id: second,
					label: "b",
					model: parsedModel.value,
					similarModel: true,
				},
			],
		});
		const parsed = parseSetDefaultSlotOrderInput({
			orderedSlotIds: [second, first],
		});
		expect(parsed.kind).toBe("ok");
		if (parsed.kind !== "ok") {
			return;
		}
		const ordered = await setDefaultModelSlotOrder({
			...sessionDeps(store),
			orderedSlotIds: parsed.value,
			store,
		});
		expect(ordered.kind).toBe("ok");
		if (ordered.kind !== "ok") {
			return;
		}
		expect(ordered.value.map((slot) => slot.id)).toEqual([second, first]);
	});

	test("deleteModelSlot removes by parsed id", async () => {
		const slotId = newModelSlotId();
		const parsedModel = modelName("claude-opus-5");
		if (parsedModel.kind === "invalid") {
			throw new Error(parsedModel.message);
		}
		const store = mockStore({
			accounts: [],
			sealed: new Map(),
			slots: [
				{
					accountId: newAccountId(),
					createdAt: 1,
					defaultSortIndex: 0,
					engine: "claude",
					fast: false,
					id: slotId,
					label: "gone",
					model: parsedModel.value,
					similarModel: true,
				},
			],
		});
		const parsed = parseDeleteModelSlotInput({ id: slotId });
		expect(parsed.kind).toBe("ok");
		if (parsed.kind !== "ok") {
			return;
		}
		await expect(
			deleteModelSlot({
				...sessionDeps(store),
				id: parsed.value,
				store,
			}),
		).resolves.toEqual({ kind: "ok", value: undefined });
	});

	test("getVaultAccountSealed returns ciphertext for owner", async () => {
		const encryptionKey = generateEncryptionKey();
		const accountId = newAccountId();
		const sealed = await encryptCredential({
			accountId,
			plaintext: "sk-ant-secret",
			encryptionKey,
		});
		const store = mockStore({
			accounts: [
				{
					createdAt: 1,
					engine: "claude",
					id: accountId,
					label: "work",
				},
			],
			sealed: new Map([[accountId, sealed]]),
			slots: [],
		});
		const row = await getVaultAccountSealed({
			...sessionDeps(store),
			id: accountId,
			store,
		});
		expect(row.kind).toBe("ok");
		if (row.kind !== "ok") {
			return;
		}
		expect(row.value.sealed).toEqual(sealed);
		expect(JSON.stringify(row.value)).not.toMatch(/sk-ant-secret/u);
	});
});
