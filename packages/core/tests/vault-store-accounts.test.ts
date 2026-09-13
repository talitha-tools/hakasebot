import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { afterEach, describe, expect, test } from "vitest";

import { encryptCredential, generateEncryptionKey } from "#/vault/crypto.ts";
import { newAccountId } from "#/vault/domain.ts";
import { createD1VaultStore } from "#/vault/store.ts";

const anyNumber: unknown = expect.any(Number);

const USER = "9001";

describe("createD1VaultStore account methods", () => {
	const encryptionKey = generateEncryptionKey();
	let store = createD1VaultStore(memoryD1());

	afterEach(() => {
		store = createD1VaultStore(memoryD1());
	});

	test("saveAccount stores ciphertext metadata without plaintext", async () => {
		const accountId = newAccountId();
		const sealed = await encryptCredential({
			accountId,
			plaintext: "sk-ant-secret",
			encryptionKey,
		});
		const saved = await store.saveAccount({
			engine: "claude",
			githubUserId: USER,
			label: "work",
			sealed,
		});
		expect(saved).toEqual({
			kind: "ok",
			value: {
				createdAt: anyNumber,
				engine: "claude",
				id: accountId,
				label: "work",
			},
		});
		const row = await store.getAccount({ githubUserId: USER, id: accountId });
		expect(row.kind).toBe("ok");
		if (row.kind !== "ok") {
			return;
		}
		expect(row.value.sealed.ciphertext).toBe(sealed.ciphertext);
		expect(JSON.stringify(row.value)).not.toMatch(/sk-ant-secret/u);
	});

	test("listAccounts returns metadata rows in created order", async () => {
		const firstId = newAccountId();
		const secondId = newAccountId();
		const first = await encryptCredential({
			accountId: firstId,
			plaintext: "one",
			encryptionKey,
		});
		const second = await encryptCredential({
			accountId: secondId,
			plaintext: "two",
			encryptionKey,
		});
		await store.saveAccount({
			engine: "codex",
			githubUserId: USER,
			label: "first",
			sealed: first,
		});
		await store.saveAccount({
			engine: "grok",
			githubUserId: USER,
			label: "second",
			sealed: second,
		});
		const listed = await store.listAccounts({ githubUserId: USER });
		expect(listed).toEqual({
			kind: "ok",
			value: [
				{
					createdAt: anyNumber,
					engine: "codex",
					id: firstId,
					label: "first",
				},
				{
					createdAt: anyNumber,
					engine: "grok",
					id: secondId,
					label: "second",
				},
			],
		});
	});

	test("getAccount returns sealed row for owner", async () => {
		const accountId = newAccountId();
		const sealed = await encryptCredential({
			accountId,
			plaintext: "cursor-token",
			encryptionKey,
		});
		await store.saveAccount({
			engine: "cursor",
			githubUserId: USER,
			label: "cursor",
			sealed,
		});
		const row = await store.getAccount({
			githubUserId: USER,
			id: accountId,
		});
		expect(row.kind).toBe("ok");
		if (row.kind !== "ok") {
			return;
		}
		expect(row.value.sealed).toEqual(sealed);
		expect(row.value.githubUserId).toBe(USER);
	});

	test("deleteAccount removes row for owner", async () => {
		const accountId = newAccountId();
		const sealed = await encryptCredential({
			accountId,
			plaintext: "gone",
			encryptionKey,
		});
		await store.saveAccount({
			engine: "claude",
			githubUserId: USER,
			label: "temp",
			sealed,
		});
		await expect(
			store.deleteAccount({ githubUserId: USER, id: accountId }),
		).resolves.toEqual({ kind: "ok", value: undefined });
		await expect(store.listAccounts({ githubUserId: USER })).resolves.toEqual({
			kind: "ok",
			value: [],
		});
	});
});
