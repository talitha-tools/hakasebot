import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { afterEach, describe, expect, test } from "vitest";

import { modelName } from "#/domain.ts";
import { encryptCredential, generateEncryptionKey } from "#/vault/crypto.ts";
import { newAccountId, newModelSlotId } from "#/vault/domain.ts";
import { createD1VaultStore } from "#/vault/store.ts";

const USER = "rotate-user";
const theaLab = testRepoRef("thea/lab", "910001");

describe("createD1VaultStore rotate methods", () => {
	let store = createD1VaultStore(memoryD1());

	afterEach(() => {
		store = createD1VaultStore(memoryD1());
	});

	test("previewRotateVault returns accurate counts", async () => {
		const key = generateEncryptionKey();
		const sealed = await encryptCredential({
			accountId: newAccountId(),
			plaintext: "secret",
			encryptionKey: key,
		});
		await store.saveAccount({
			engine: "claude",
			githubUserId: USER,
			label: "work",
			sealed,
		});
		const parsedModel = modelName("claude-sonnet-4-20250514");
		if (parsedModel.kind === "invalid") {
			throw new Error(parsedModel.message);
		}
		const slotId = newModelSlotId();
		await store.saveModelSlot({
			accountId: sealed.accountId,
			defaultSortIndex: 0,
			engine: "claude",
			githubUserId: USER,
			label: "primary",
			model: parsedModel.value,
			slotId,
		});
		await store.enableRepo({ githubUserId: USER, repo: theaLab });
		await store.setRepoModelList({
			githubUserId: USER,
			orderedSlotIds: [slotId],
			repo: theaLab,
		});

		const preview = await store.previewRotateVault({ githubUserId: USER });
		expect(preview).toEqual({
			kind: "ok",
			value: {
				accountCount: 1,
				enabledRepoCount: 1,
				overrideCount: 1,
				repos: [theaLab],
				slotCount: 1,
			},
		});
	});

	test("rotateVault wipes ciphertext and bumps epoch", async () => {
		const key = generateEncryptionKey();
		const sealed = await encryptCredential({
			accountId: newAccountId(),
			plaintext: "secret",
			encryptionKey: key,
		});
		await store.saveAccount({
			engine: "claude",
			githubUserId: USER,
			label: "work",
			sealed,
		});
		const parsedModel = modelName("claude-sonnet-4-20250514");
		if (parsedModel.kind === "invalid") {
			throw new Error(parsedModel.message);
		}
		const slotId = newModelSlotId();
		await store.saveModelSlot({
			accountId: sealed.accountId,
			defaultSortIndex: 0,
			engine: "claude",
			githubUserId: USER,
			label: "primary",
			model: parsedModel.value,
			slotId,
		});
		await store.enableRepo({ githubUserId: USER, repo: theaLab });
		await store.setRepoModelList({
			githubUserId: USER,
			orderedSlotIds: [slotId],
			repo: theaLab,
		});

		const rotated = await store.rotateVault({ githubUserId: USER });
		expect(rotated).toEqual({ kind: "ok", value: { epoch: 2 } });
		await expect(store.countAccounts({ githubUserId: USER })).resolves.toEqual({
			kind: "ok",
			value: 0,
		});
		const listed = await store.listEnabledRepos({ githubUserId: USER });
		expect(listed.kind).toBe("ok");
		if (listed.kind === "ok") {
			expect(listed.value).toHaveLength(1);
		}
		const slots = await store.listSlotsForRepo({
			githubUserId: USER,
			repo: theaLab,
		});
		expect(slots).toEqual({ kind: "ok", value: [] });
		await expect(store.readVaultEpoch({ githubUserId: USER })).resolves.toEqual(
			{ kind: "ok", value: 2 },
		);
	});
});
