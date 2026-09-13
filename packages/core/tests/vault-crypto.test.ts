import { describe, expect, test } from "vitest";

import {
	decryptCredential,
	encryptCredential,
	generateEncryptionKey,
} from "#/vault/crypto.ts";
import { newAccountId } from "#/vault/domain.ts";

describe("vault crypto", () => {
	test("round-trips credential seal with AAD bound to account id", async () => {
		const encryptionKey = generateEncryptionKey();
		const accountId = newAccountId();
		const sealed = await encryptCredential({
			accountId,
			plaintext: '{"access_token":"test"}',
			encryptionKey,
		});
		const opened = await decryptCredential({ sealed, encryptionKey });
		expect(opened).toEqual({ kind: "ok", value: '{"access_token":"test"}' });
	});

	test("rejects decrypt when account id AAD does not match", async () => {
		const encryptionKey = generateEncryptionKey();
		const sealed = await encryptCredential({
			accountId: newAccountId(),
			plaintext: "secret",
			encryptionKey,
		});
		const tampered = { ...sealed, accountId: newAccountId() };
		const opened = await decryptCredential({ sealed: tampered, encryptionKey });
		expect(opened.kind).toBe("invalid");
	});
});
