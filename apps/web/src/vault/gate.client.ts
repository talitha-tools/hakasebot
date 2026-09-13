import type { ParseResult } from "@hakasebot/core/domain.ts";
import {
	decryptCredential,
	generateEncryptionKey,
} from "@hakasebot/core/vault/crypto.ts";
import type {
	SealedCredential,
	VaultGate,
	EncryptionKey,
} from "@hakasebot/core/vault/domain.ts";
import { encryptionKey } from "@hakasebot/core/vault/domain.ts";

import { m as msg } from "#/paraglide/messages.js";

export function resolveVaultGate(args: {
	sessionKey: EncryptionKey | undefined;
	ceremonyAcked: boolean;
	hasCiphertext: boolean;
	localKeyUnlocks?: boolean;
}): VaultGate {
	if (args.sessionKey !== undefined && args.ceremonyAcked) {
		if (args.hasCiphertext && args.localKeyUnlocks !== true) {
			return { kind: "import" };
		}
		return { kind: "open", key: args.sessionKey };
	}
	if (args.hasCiphertext) {
		if (args.sessionKey !== undefined && args.localKeyUnlocks === true) {
			return { kind: "ceremony", key: args.sessionKey };
		}
		return { kind: "import" };
	}
	if (args.sessionKey === undefined) {
		throw new Error(
			"resolveVaultGate requires a generated key when ciphertext is absent",
		);
	}
	return { kind: "ceremony", key: args.sessionKey };
}

export function prepareVaultGate(args: {
	sessionKey: EncryptionKey | undefined;
	ceremonyAcked: boolean;
	hasCiphertext: boolean;
	localKeyUnlocks?: boolean;
	mint?: () => EncryptionKey;
}): { gate: VaultGate; sessionKey: EncryptionKey | undefined } {
	const sessionKey = args.hasCiphertext
		? args.sessionKey
		: (args.sessionKey ?? (args.mint ?? generateEncryptionKey)());
	return {
		gate: resolveVaultGate({
			ceremonyAcked: args.ceremonyAcked,
			hasCiphertext: args.hasCiphertext,
			sessionKey,
			...(args.localKeyUnlocks === undefined
				? {}
				: { localKeyUnlocks: args.localKeyUnlocks }),
		}),
		sessionKey,
	};
}

export async function validateImportedKey(args: {
	key: EncryptionKey;
	sealed: SealedCredential;
}): Promise<ParseResult<EncryptionKey>> {
	const opened = await decryptCredential({
		sealed: args.sealed,
		encryptionKey: args.key,
	});
	if (opened.kind === "invalid") {
		return {
			kind: "invalid",
			message: msg.import_key_mismatch(),
		};
	}
	return { kind: "ok", value: args.key };
}

export function parseImportedEncryptionKey(
	raw: string,
): ParseResult<EncryptionKey> {
	return encryptionKey(raw);
}
