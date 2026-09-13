import type {
	RotateVaultPreview,
	VaultStore,
} from "@hakasebot/core/vault/store.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { describe, expect, test } from "vitest";

import {
	confirmRotate,
	parseConfirmRotateInput,
	previewRotate,
	rotateVault,
} from "#/web-app/rotate.server.ts";

import { FAKE_SESSION_COOKIE } from "./session-fixture.ts";

const USER = "99";

const labRepo = testRepoRef("thea/lab", 910_001);
const otherRepo = testRepoRef("thea/other", 910_002);

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

function rotateStore(
	preview: RotateVaultPreview,
	args?: { onRotate?: () => void },
): VaultStore {
	return {
		async countAccounts() {
			await Promise.resolve();
			return { kind: "ok" as const, value: preview.accountCount };
		},
		deleteAccount() {
			throw new Error("not implemented");
		},
		deleteModelSlot() {
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
		getAccount() {
			throw new Error("not implemented");
		},
		async getFirstSealedAccount() {
			await Promise.resolve();
			return { kind: "ok" as const, value: undefined };
		},
		listAccounts() {
			throw new Error("not implemented");
		},
		listEnabledRepos() {
			throw new Error("not implemented");
		},
		listModelSlots() {
			throw new Error("not implemented");
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
		async previewRotateVault() {
			await Promise.resolve();
			return { kind: "ok" as const, value: preview };
		},
		async readVaultEpoch() {
			await Promise.resolve();
			return { kind: "ok" as const, value: 1 };
		},
		async rotateVault() {
			args?.onRotate?.();
			await Promise.resolve();
			return { kind: "ok" as const, value: { epoch: 2 } };
		},
		saveAccount() {
			throw new Error("not implemented");
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
	};
}

describe("rotate.server", () => {
	test("parseConfirmRotateInput accepts repo ids", () => {
		expect(parseConfirmRotateInput({ repos: [labRepo.id] })).toEqual({
			kind: "ok",
			value: [labRepo.id],
		});
	});

	test("previewRotate returns store preview", async () => {
		const preview: RotateVaultPreview = {
			accountCount: 2,
			enabledRepoCount: 1,
			overrideCount: 0,
			repos: [labRepo],
			slotCount: 3,
		};
		const result = await previewRotate(sessionDeps(rotateStore(preview)));
		expect(result).toEqual({ kind: "ok", value: preview });
	});

	test("confirmRotate rejects when enabled repos drift", async () => {
		const preview: RotateVaultPreview = {
			accountCount: 1,
			enabledRepoCount: 1,
			overrideCount: 0,
			repos: [labRepo],
			slotCount: 1,
		};
		const result = await confirmRotate({
			...sessionDeps(rotateStore(preview)),
			repos: [otherRepo.id],
		});
		expect(result.kind).toBe("invalid");
	});

	test("confirmRotate passes when repo list matches", async () => {
		const preview: RotateVaultPreview = {
			accountCount: 1,
			enabledRepoCount: 1,
			overrideCount: 0,
			repos: [labRepo],
			slotCount: 1,
		};
		const result = await confirmRotate({
			...sessionDeps(rotateStore(preview)),
			repos: preview.repos.map((repo) => repo.id),
		});
		expect(result).toEqual({ kind: "ok", value: undefined });
	});

	test("rotateVault returns new epoch", async () => {
		const preview: RotateVaultPreview = {
			accountCount: 0,
			enabledRepoCount: 0,
			overrideCount: 0,
			repos: [],
			slotCount: 0,
		};
		const result = await rotateVault({
			...sessionDeps(rotateStore(preview)),
			repos: [],
		});
		expect(result).toEqual({ kind: "ok", value: { epoch: 2 } });
	});

	test("rotateVault rejects a wipe when preview repos do not match", async () => {
		const preview: RotateVaultPreview = {
			accountCount: 1,
			enabledRepoCount: 1,
			overrideCount: 0,
			repos: [labRepo],
			slotCount: 1,
		};
		let rotated = false;
		const result = await rotateVault({
			...sessionDeps(
				rotateStore(preview, {
					onRotate: () => {
						rotated = true;
					},
				}),
			),
			repos: [otherRepo.id],
		});
		expect(result.kind).toBe("invalid");
		expect(rotated).toBe(false);
	});
});
