import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { afterEach, describe, expect, test } from "vitest";

import { modelName } from "#/domain.ts";
import { encryptCredential, generateEncryptionKey } from "#/vault/crypto.ts";
import { newAccountId, newModelSlotId } from "#/vault/domain.ts";
import { createD1VaultStore } from "#/vault/store.ts";

const USER = "9001";

describe("createD1VaultStore model slot methods", () => {
	const encryptionKey = generateEncryptionKey();
	let store = createD1VaultStore(memoryD1());

	afterEach(() => {
		store = createD1VaultStore(memoryD1());
	});

	async function seedAccount(engine: "claude" | "codex" = "claude") {
		const accountId = newAccountId();
		const sealed = await encryptCredential({
			accountId,
			plaintext: "sk-test",
			encryptionKey,
		});
		const saved = await store.saveAccount({
			engine,
			githubUserId: USER,
			label: "work",
			sealed,
		});
		expect(saved.kind).toBe("ok");
		if (saved.kind !== "ok") {
			throw new Error("account seed failed");
		}
		return accountId;
	}

	test("saveModelSlot inserts a row tied to a vault account", async () => {
		const accountId = await seedAccount();
		const parsedModel = modelName("claude-opus-5");
		if (parsedModel.kind === "invalid") {
			throw new Error(parsedModel.message);
		}
		const saved = await store.saveModelSlot({
			accountId,
			defaultSortIndex: 0,
			engine: "claude",
			fast: true,
			githubUserId: USER,
			label: "opus pass",
			model: parsedModel.value,
		});
		expect(saved.kind).toBe("ok");
		if (saved.kind !== "ok") {
			return;
		}
		expect(saved.value.fast).toBe(true);
		expect(saved.value.similarModel).toBe(true);
		expect(saved.value.effort).toBeUndefined();
		const listed = await store.listModelSlots({ githubUserId: USER });
		expect(listed.kind).toBe("ok");
		if (listed.kind === "ok") {
			expect(listed.value).toHaveLength(1);
			expect(listed.value[0]?.effort).toBeUndefined();
		}
	});

	test("saveModelSlot persists similarModel off", async () => {
		const accountId = await seedAccount();
		const parsedModel = modelName("claude-opus-4-8");
		if (parsedModel.kind === "invalid") {
			throw new Error(parsedModel.message);
		}
		const saved = await store.saveModelSlot({
			accountId,
			defaultSortIndex: 0,
			engine: "claude",
			githubUserId: USER,
			label: "pinned opus",
			model: parsedModel.value,
			similarModel: false,
		});
		expect(saved.kind).toBe("ok");
		if (saved.kind !== "ok") {
			return;
		}
		expect(saved.value.similarModel).toBe(false);
		const listed = await store.listModelSlots({ githubUserId: USER });
		expect(listed.kind).toBe("ok");
		if (listed.kind === "ok") {
			expect(listed.value[0]?.similarModel).toBe(false);
		}
	});

	test("listModelSlots returns rows in default_sort_index order", async () => {
		const accountId = await seedAccount();
		const parsedModel = modelName("claude-opus-5");
		if (parsedModel.kind === "invalid") {
			throw new Error(parsedModel.message);
		}
		const firstId = newModelSlotId();
		const secondId = newModelSlotId();
		await store.saveModelSlot({
			accountId,
			defaultSortIndex: 1,
			engine: "claude",
			githubUserId: USER,
			label: "second",
			model: parsedModel.value,
			slotId: secondId,
		});
		await store.saveModelSlot({
			accountId,
			defaultSortIndex: 0,
			engine: "claude",
			githubUserId: USER,
			label: "first",
			model: parsedModel.value,
			slotId: firstId,
		});
		const listed = await store.listModelSlots({ githubUserId: USER });
		expect(listed).toEqual({
			kind: "ok",
			value: [
				expect.objectContaining({ id: firstId, label: "first" }),
				expect.objectContaining({ id: secondId, label: "second" }),
			],
		});
	});

	test("setDefaultSlotOrder rewrites priority and persists", async () => {
		const accountId = await seedAccount();
		const parsedModel = modelName("claude-opus-5");
		if (parsedModel.kind === "invalid") {
			throw new Error(parsedModel.message);
		}
		const firstId = newModelSlotId();
		const secondId = newModelSlotId();
		await store.saveModelSlot({
			accountId,
			defaultSortIndex: 0,
			engine: "claude",
			githubUserId: USER,
			label: "a",
			model: parsedModel.value,
			slotId: firstId,
		});
		await store.saveModelSlot({
			accountId,
			defaultSortIndex: 1,
			engine: "claude",
			githubUserId: USER,
			label: "b",
			model: parsedModel.value,
			slotId: secondId,
		});
		const reordered = await store.setDefaultSlotOrder({
			githubUserId: USER,
			orderedSlotIds: [secondId, firstId],
		});
		expect(reordered.kind).toBe("ok");
		if (reordered.kind !== "ok") {
			return;
		}
		expect(reordered.value.map((slot) => slot.id)).toEqual([secondId, firstId]);
		const listed = await store.listModelSlots({ githubUserId: USER });
		expect(listed.kind).toBe("ok");
		if (listed.kind !== "ok") {
			return;
		}
		expect(listed.value.map((slot) => slot.id)).toEqual([secondId, firstId]);
	});

	test("deleteModelSlot removes the row", async () => {
		const accountId = await seedAccount();
		const parsedModel = modelName("claude-opus-5");
		if (parsedModel.kind === "invalid") {
			throw new Error(parsedModel.message);
		}
		const slotId = newModelSlotId();
		await store.saveModelSlot({
			accountId,
			defaultSortIndex: 0,
			engine: "claude",
			githubUserId: USER,
			label: "gone",
			model: parsedModel.value,
			slotId,
		});
		await expect(
			store.deleteModelSlot({ githubUserId: USER, id: slotId }),
		).resolves.toEqual({ kind: "ok", value: undefined });
		await expect(store.listModelSlots({ githubUserId: USER })).resolves.toEqual(
			{
				kind: "ok",
				value: [],
			},
		);
	});
});
