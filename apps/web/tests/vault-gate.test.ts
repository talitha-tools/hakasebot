import { readFile } from "node:fs/promises";
import path from "node:path";

import { brandString } from "@hakasebot/core/domain.ts";
import {
	encryptCredential,
	generateEncryptionKey,
} from "@hakasebot/core/vault/crypto.ts";
import { newAccountId } from "@hakasebot/core/vault/domain.ts";
import { createD1VaultStore } from "@hakasebot/core/vault/store.ts";
import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { memorySessionStorage } from "@hakasebot/test-kit/helpers/session-storage.ts";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { parseDevUser } from "#/lib/dev-user.ts";
import { m as msg } from "#/paraglide/messages.js";
import {
	parseImportedEncryptionKey,
	prepareVaultGate,
	resolveVaultGate,
	validateImportedKey,
} from "#/vault/gate.client.ts";
import { readVaultGateSnapshot } from "#/vault/gate.server.ts";
import {
	clearCeremonyAck,
	clearEncryptionKey,
	commitStagedEncryptionKey,
	discardStagedEncryptionKey,
	exportEncryptionKey,
	importEncryptionKey,
	loadStagedEncryptionKey,
	loadEncryptionKey,
	readCeremonyAck,
	stageEncryptionKeyForRotate,
	writeCeremonyAck,
} from "#/vault/session-key.client.ts";

import { FAKE_SESSION_COOKIE } from "./session-fixture.ts";

const USER = "4242";

describe("resolveVaultGate", () => {
	const key = generateEncryptionKey();

	test("first login with minted key and no ack is ceremony", () => {
		expect(
			resolveVaultGate({
				ceremonyAcked: false,
				hasCiphertext: false,
				sessionKey: key,
			}),
		).toEqual({ kind: "ceremony", key });
	});

	test("acked key without ciphertext is open", () => {
		expect(
			resolveVaultGate({
				ceremonyAcked: true,
				hasCiphertext: false,
				sessionKey: key,
			}),
		).toEqual({ kind: "open", key });
	});

	test("ciphertext and no local key is import", () => {
		expect(
			resolveVaultGate({
				ceremonyAcked: false,
				hasCiphertext: true,
				sessionKey: undefined,
			}),
		).toEqual({ kind: "import" });
	});

	test("ciphertext with unacked local key that does not unlock is import", () => {
		expect(
			resolveVaultGate({
				ceremonyAcked: false,
				hasCiphertext: true,
				localKeyUnlocks: false,
				sessionKey: key,
			}),
		).toEqual({ kind: "import" });
	});

	test("ciphertext with unacked local key that unlocks is ceremony", () => {
		expect(
			resolveVaultGate({
				ceremonyAcked: false,
				hasCiphertext: true,
				localKeyUnlocks: true,
				sessionKey: key,
			}),
		).toEqual({ kind: "ceremony", key });
	});

	test("ciphertext with unacked local key and no unlock check is import", () => {
		expect(
			resolveVaultGate({
				ceremonyAcked: false,
				hasCiphertext: true,
				sessionKey: key,
			}),
		).toEqual({ kind: "import" });
	});

	test("ciphertext with acked local key that unlocks is open", () => {
		expect(
			resolveVaultGate({
				ceremonyAcked: true,
				hasCiphertext: true,
				localKeyUnlocks: true,
				sessionKey: key,
			}),
		).toEqual({ kind: "open", key });
	});

	test("ciphertext with acked local key that does not unlock is import", () => {
		expect(
			resolveVaultGate({
				ceremonyAcked: true,
				hasCiphertext: true,
				localKeyUnlocks: false,
				sessionKey: key,
			}),
		).toEqual({ kind: "import" });
	});

	test("missing key without ciphertext is an interpreter bug", () => {
		expect(() =>
			resolveVaultGate({
				ceremonyAcked: false,
				hasCiphertext: false,
				sessionKey: undefined,
			}),
		).toThrow(/generated key/u);
	});
});

describe("prepareVaultGate", () => {
	test("mints only when ciphertext is absent and no session key exists", () => {
		const minted = generateEncryptionKey();
		let mintCalls = 0;
		const prepared = prepareVaultGate({
			ceremonyAcked: false,
			hasCiphertext: false,
			mint: () => {
				mintCalls += 1;
				return minted;
			},
			sessionKey: undefined,
		});
		expect(mintCalls).toBe(1);
		expect(prepared).toEqual({
			gate: { kind: "ceremony", key: minted },
			sessionKey: minted,
		});
	});

	test("resumes ceremony when the local key unlocks existing ciphertext", () => {
		const key = generateEncryptionKey();
		const prepared = prepareVaultGate({
			ceremonyAcked: false,
			hasCiphertext: true,
			localKeyUnlocks: true,
			sessionKey: key,
		});
		expect(prepared).toEqual({
			gate: { kind: "ceremony", key },
			sessionKey: key,
		});
	});

	test("never mints when ciphertext exists", () => {
		let mintCalls = 0;
		const prepared = prepareVaultGate({
			ceremonyAcked: false,
			hasCiphertext: true,
			mint: () => {
				mintCalls += 1;
				return generateEncryptionKey();
			},
			sessionKey: undefined,
		});
		expect(mintCalls).toBe(0);
		expect(prepared.gate).toEqual({ kind: "import" });
		expect(prepared.sessionKey).toBeUndefined();
	});
});

describe("import validation", () => {
	test("rejects a key that cannot decrypt the stored row", async () => {
		const accountId = newAccountId();
		const sealed = await encryptCredential({
			accountId,
			plaintext: "secret",
			encryptionKey: generateEncryptionKey(),
		});
		const checked = await validateImportedKey({
			key: generateEncryptionKey(),
			sealed,
		});
		expect(checked).toEqual({
			kind: "invalid",
			message: msg.import_key_mismatch(),
		});
	});

	test("accepts the key that sealed the row", async () => {
		const encryptionKey = generateEncryptionKey();
		const accountId = newAccountId();
		const sealed = await encryptCredential({
			accountId,
			plaintext: "secret",
			encryptionKey,
		});
		await expect(
			validateImportedKey({ key: encryptionKey, sealed }),
		).resolves.toEqual({ kind: "ok", value: encryptionKey });
	});

	test("parseImportedEncryptionKey rejects empty paste", () => {
		expect(parseImportedEncryptionKey("   ").kind).toBe("invalid");
	});
});

describe("session key", () => {
	beforeEach(() => {
		Object.defineProperty(globalThis, "sessionStorage", {
			configurable: true,
			value: memorySessionStorage(),
		});
	});

	afterEach(() => {
		clearEncryptionKey(USER);
		clearCeremonyAck(USER);
	});

	test("loadEncryptionKey does not mint", () => {
		expect(loadEncryptionKey(USER)).toBeUndefined();
		expect(loadEncryptionKey(USER)).toBeUndefined();
	});

	test("import then load returns the same key", () => {
		const key = generateEncryptionKey();
		importEncryptionKey({ githubUserId: USER, key });
		expect(loadEncryptionKey(USER)).toBe(key);
	});

	test("import then export returns the same key", () => {
		const key = generateEncryptionKey();
		importEncryptionKey({ githubUserId: USER, key });
		expect(exportEncryptionKey(USER)).toBe(key);
	});

	test("ceremony ack is off until written", () => {
		expect(readCeremonyAck(USER)).toBe(false);
		writeCeremonyAck(USER);
		expect(readCeremonyAck(USER)).toBe(true);
	});

	test("staged rotate key commits and clears ceremony ack", () => {
		const oldKey = generateEncryptionKey();
		const newKey = generateEncryptionKey();
		importEncryptionKey({ githubUserId: USER, key: oldKey });
		writeCeremonyAck(USER);
		stageEncryptionKeyForRotate({ githubUserId: USER, key: newKey });
		expect(loadEncryptionKey(USER)).toBe(oldKey);
		expect(commitStagedEncryptionKey(USER)).toBe(newKey);
		expect(loadEncryptionKey(USER)).toBe(newKey);
		expect(readCeremonyAck(USER)).toBe(false);
		expect(loadStagedEncryptionKey(USER)).toBeUndefined();
	});

	test("discardStagedEncryptionKey leaves the active key alone", () => {
		const oldKey = generateEncryptionKey();
		const newKey = generateEncryptionKey();
		importEncryptionKey({ githubUserId: USER, key: oldKey });
		stageEncryptionKeyForRotate({ githubUserId: USER, key: newKey });
		discardStagedEncryptionKey(USER);
		expect(loadEncryptionKey(USER)).toBe(oldKey);
		expect(loadStagedEncryptionKey(USER)).toBeUndefined();
	});
});

describe("store reads", () => {
	test("countAccounts and epoch and first sealed row", async () => {
		const db = memoryD1();
		const store = createD1VaultStore(db);
		await store.saveAccount({
			engine: "claude",
			githubUserId: USER,
			label: "one",
			sealed: {
				accountId: brandString("acc_one", "AccountId"),
				ciphertext: brandString("Y2lwaGVy", "Ciphertext"),
				iv: brandString("aXZpdml2aXZpdml2", "Iv"),
			},
		});
		await db
			.prepare(
				"INSERT INTO encryption_key_meta (github_user_id, epoch, rotated_at) VALUES (?, ?, ?)",
			)
			.bind(USER, 3, Date.now())
			.run();
		await expect(store.countAccounts({ githubUserId: USER })).resolves.toEqual({
			kind: "ok",
			value: 1,
		});
		await expect(store.readVaultEpoch({ githubUserId: USER })).resolves.toEqual(
			{
				kind: "ok",
				value: 3,
			},
		);
		await expect(
			store.getFirstSealedAccount({ githubUserId: USER }),
		).resolves.toEqual({
			kind: "ok",
			value: {
				accountId: "acc_one",
				ciphertext: "Y2lwaGVy",
				iv: "aXZpdml2aXZpdml2",
			},
		});
	});

	test("missing meta row is undefined epoch", async () => {
		const store = createD1VaultStore(memoryD1());
		await expect(store.readVaultEpoch({ githubUserId: USER })).resolves.toEqual(
			{
				kind: "ok",
				value: undefined,
			},
		);
		await expect(
			store.getFirstSealedAccount({ githubUserId: USER }),
		).resolves.toEqual({ kind: "ok", value: undefined });
	});
});

describe("vault gate snapshot", () => {
	test("returns count and sample without an encryption key field", async () => {
		const sealed = await encryptCredential({
			accountId: newAccountId(),
			plaintext: "secret",
			encryptionKey: generateEncryptionKey(),
		});
		const snapshot = await readVaultGateSnapshot({
			cookieHeader: FAKE_SESSION_COOKIE,
			fetchGithubUser: async () => {
				await Promise.resolve();
				return { kind: "ok", json: { id: 7, login: "thea" } };
			},
			getAccessToken: async () => {
				await Promise.resolve();
				return { accessToken: "gho_test" };
			},
			store: {
				async countAccounts() {
					await Promise.resolve();
					return { kind: "ok", value: 1 };
				},
				async getFirstSealedAccount() {
					await Promise.resolve();
					return { kind: "ok", value: sealed };
				},
				async readVaultEpoch() {
					await Promise.resolve();
					return { kind: "ok", value: 2 };
				},
			},
		});
		expect(snapshot.kind).toBe("ok");
		if (snapshot.kind !== "ok") {
			return;
		}
		expect(snapshot.value.githubUserId).toBe("7");
		expect(snapshot.value.accountCount).toBe(1);
		expect(snapshot.value.epoch).toBe(2);
		expect(snapshot.value.sample).toBeDefined();
		expect(JSON.stringify(snapshot.value)).not.toMatch(
			/vaultKey|VaultKey|encryptionKey|EncryptionKey/iu,
		);
	});

	test("missing store is invalid so a key is not minted", async () => {
		const snapshot = await readVaultGateSnapshot({
			cookieHeader: FAKE_SESSION_COOKIE,
			fetchGithubUser: async () => {
				await Promise.resolve();
				return { kind: "ok", json: { id: 7 } };
			},
			getAccessToken: async () => {
				await Promise.resolve();
				return { accessToken: "gho_test" };
			},
		});
		expect(snapshot).toEqual({
			kind: "invalid",
			message: msg.vault_store_unbound_no_key(),
		});
	});

	test("bound empty store is zero accounts", async () => {
		const snapshot = await readVaultGateSnapshot({
			cookieHeader: FAKE_SESSION_COOKIE,
			fetchGithubUser: async () => {
				await Promise.resolve();
				return { kind: "ok", json: { id: 7 } };
			},
			getAccessToken: async () => {
				await Promise.resolve();
				return { accessToken: "gho_test" };
			},
			store: {
				async countAccounts() {
					await Promise.resolve();
					return { kind: "ok", value: 0 };
				},
				async getFirstSealedAccount() {
					await Promise.resolve();
					return { kind: "ok", value: undefined };
				},
				async readVaultEpoch() {
					await Promise.resolve();
					return { kind: "ok", value: undefined };
				},
			},
		});
		expect(snapshot).toEqual({
			kind: "ok",
			value: {
				accountCount: 0,
				epoch: undefined,
				githubUserId: "7",
				sample: undefined,
			},
		});
	});

	test("fake user skips GitHub /user and uses the configured id", async () => {
		const fetchGithubUser = vi.fn();
		const snapshot = await readVaultGateSnapshot({
			cookieHeader: "",
			devUser: parseDevUser({
				enabled: "1",
				githubUserId: "99",
				requestUrl: "http://localhost",
			}),
			fetchGithubUser,
			store: {
				async countAccounts() {
					await Promise.resolve();
					return { kind: "ok", value: 0 };
				},
				async getFirstSealedAccount() {
					await Promise.resolve();
					return { kind: "ok", value: undefined };
				},
				async readVaultEpoch() {
					await Promise.resolve();
					return { kind: "ok", value: undefined };
				},
			},
		});
		expect(snapshot).toEqual({
			kind: "ok",
			value: {
				accountCount: 0,
				epoch: undefined,
				githubUserId: "99",
				sample: undefined,
			},
		});
		expect(fetchGithubUser).not.toHaveBeenCalled();
	});

	test("fake user with a PAT fetches GitHub /user for the token owner", async () => {
		const fetchGithubUser = vi.fn(async () => {
			await Promise.resolve();
			return { kind: "ok" as const, json: { id: 4242 } };
		});
		const snapshot = await readVaultGateSnapshot({
			cookieHeader: "",
			devUser: parseDevUser({
				enabled: "1",
				requestUrl: "http://localhost",
				token: "ghp_test_pat",
			}),
			fetchGithubUser,
			store: {
				async countAccounts() {
					await Promise.resolve();
					return { kind: "ok", value: 0 };
				},
				async getFirstSealedAccount() {
					await Promise.resolve();
					return { kind: "ok", value: undefined };
				},
				async readVaultEpoch() {
					await Promise.resolve();
					return { kind: "ok", value: undefined };
				},
			},
		});
		expect(snapshot).toEqual({
			kind: "ok",
			value: {
				accountCount: 0,
				epoch: undefined,
				githubUserId: "4242",
				sample: undefined,
			},
		});
		expect(fetchGithubUser).toHaveBeenCalledOnce();
	});

	test("fake user with a PAT and configured id skips GitHub /user", async () => {
		const fetchGithubUser = vi.fn();
		const snapshot = await readVaultGateSnapshot({
			cookieHeader: "",
			devUser: parseDevUser({
				enabled: "1",
				githubUserId: "99",
				requestUrl: "http://localhost",
				token: "ghp_test_pat",
			}),
			fetchGithubUser,
			store: {
				async countAccounts() {
					await Promise.resolve();
					return { kind: "ok", value: 0 };
				},
				async getFirstSealedAccount() {
					await Promise.resolve();
					return { kind: "ok", value: undefined };
				},
				async readVaultEpoch() {
					await Promise.resolve();
					return { kind: "ok", value: undefined };
				},
			},
		});
		expect(snapshot).toEqual({
			kind: "ok",
			value: {
				accountCount: 0,
				epoch: undefined,
				githubUserId: "99",
				sample: undefined,
			},
		});
		expect(fetchGithubUser).not.toHaveBeenCalled();
	});
});

describe("launch schema", () => {
	test("defines encryption_key_meta, enabled_repos, and repo_routes", async () => {
		const sql = await readFile(
			path.join(import.meta.dirname, "..", "migrations", "0001_init.sql"),
			"utf8",
		);
		expect(sql).toContain("CREATE TABLE encryption_key_meta");
		expect(sql).toContain("CREATE TABLE enabled_repos");
		expect(sql).toContain("synced_epoch");
		expect(sql).toContain("home_at");
		expect(sql).not.toContain("caller_at");
		expect(sql).toContain("CREATE TABLE repo_routes");
		expect(sql).not.toContain("legacy_caller");
	});
});

describe("deleted silent mint", () => {
	test("session-key no longer exports silent mint helpers", async () => {
		const module = await import("#/vault/session-key.client.ts");
		expect("loadOrCreateEncryptionKey" in module).toBe(false);
		expect("loadOrCreateVaultKey" in module).toBe(false);
	});
});
