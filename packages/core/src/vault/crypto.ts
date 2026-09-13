import { base64Encode, base64ToBytes } from "#/base64.ts";
import { brandString } from "#/domain.ts";
import type { ParseResult } from "#/domain.ts";

import type { AccountId, SealedCredential, EncryptionKey } from "./domain.ts";
import { ENCRYPTION_KEY_BYTES, encryptionKey } from "./domain.ts";

const IV_BYTES = 12;

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return Uint8Array.from(bytes).buffer;
}

async function importEncryptionKey(raw: EncryptionKey): Promise<CryptoKey> {
	const bytes = base64ToBytes(raw);
	if (bytes.length !== ENCRYPTION_KEY_BYTES) {
		throw new Error(
			`encryption key must be ${String(ENCRYPTION_KEY_BYTES)} bytes`,
		);
	}
	return crypto.subtle.importKey(
		"raw",
		toArrayBuffer(bytes),
		"AES-GCM",
		false,
		["encrypt", "decrypt"],
	);
}

export function generateEncryptionKey(): EncryptionKey {
	const bytes = new Uint8Array(ENCRYPTION_KEY_BYTES);
	crypto.getRandomValues(bytes);
	const parsed = encryptionKey(base64Encode(bytes));
	if (parsed.kind === "invalid") {
		throw new Error(parsed.message);
	}
	return parsed.value;
}

export async function encryptCredential(args: {
	encryptionKey: EncryptionKey;
	accountId: AccountId;
	plaintext: string;
}): Promise<SealedCredential> {
	const key = await importEncryptionKey(args.encryptionKey);
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const ciphertext = await crypto.subtle.encrypt(
		{
			additionalData: new TextEncoder().encode(args.accountId),
			iv,
			name: "AES-GCM",
		},
		key,
		new TextEncoder().encode(args.plaintext),
	);
	return {
		accountId: args.accountId,
		ciphertext: brandString(
			base64Encode(new Uint8Array(ciphertext)),
			"Ciphertext",
		),
		iv: brandString(base64Encode(iv), "Iv"),
	};
}

export async function decryptCredential(args: {
	encryptionKey: EncryptionKey;
	sealed: SealedCredential;
}): Promise<ParseResult<string>> {
	try {
		const key = await importEncryptionKey(args.encryptionKey);
		const iv = base64ToBytes(args.sealed.iv);
		const ciphertext = base64ToBytes(args.sealed.ciphertext);
		const plaintext = await crypto.subtle.decrypt(
			{
				additionalData: new TextEncoder().encode(args.sealed.accountId),
				iv: toArrayBuffer(iv),
				name: "AES-GCM",
			},
			key,
			toArrayBuffer(ciphertext),
		);
		return {
			kind: "ok",
			value: new TextDecoder().decode(plaintext),
		};
	} catch {
		return { kind: "invalid", message: "credential decrypt failed" };
	}
}
