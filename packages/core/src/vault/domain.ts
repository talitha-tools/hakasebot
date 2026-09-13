import { z } from "zod";

import { base64ToBytes } from "#/base64.ts";
import { brandString } from "#/domain.ts";
import type { EngineKind, ParseResult } from "#/domain.ts";
import { unknownText } from "#/is-record.ts";
import { fromParseResult, parseJsonText, parseUnknown } from "#/zod-parse.ts";

/** 32-byte user-scoped key; generated in the browser, never sent to our server. */
export type EncryptionKey = string & { readonly __brand: "EncryptionKey" };

export type VaultGate =
	| { kind: "ceremony"; key: EncryptionKey }
	| { kind: "import" }
	| { kind: "open"; key: EncryptionKey };

export type AccountId = string & { readonly __brand: "AccountId" };

export type ModelSlotId = string & { readonly __brand: "ModelSlotId" };

export type Ciphertext = string & { readonly __brand: "Ciphertext" };

/** Base64-encoded 12-byte AES-GCM IV. */
export type Iv = string & { readonly __brand: "Iv" };

export interface SealedCredential {
	accountId: AccountId;
	ciphertext: Ciphertext;
	iv: Iv;
}

export interface VaultGateSnapshot {
	githubUserId: string;
	accountCount: number;
	epoch: number | undefined;
	sample: SealedCredential | undefined;
}

/** Account metadata — safe to log. Accounts have no runtime order. */
export interface VaultAccountMeta {
	id: AccountId;
	engine: EngineKind;
	label: string;
	createdAt: number;
}

/** User-global D1 row — ciphertext only. */
export interface VaultAccountRow extends VaultAccountMeta {
	githubUserId: string;
	sealed: SealedCredential;
}

/** All sealed credentials for a repo sync — keyed by account id. */
export interface CredentialVault {
	version: 1;
	accounts: SealedCredential[];
}

export const VAULT_SECRET_NAMES = {
	encryptionKey: "HAKASEBOT_ENCRYPTION_KEY",
} as const;

export const ENCRYPTION_KEY_BYTES = 32;
const ACCOUNT_ID_PREFIX = "acc_";
const SLOT_ID_PREFIX = "slot_";

export function encryptionKey(value: string): ParseResult<EncryptionKey> {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return { kind: "invalid", message: "the key is empty" };
	}
	let bytes: Uint8Array;
	try {
		bytes = base64ToBytes(trimmed);
	} catch {
		return { kind: "invalid", message: "that doesn't look like the key" };
	}
	if (bytes.length !== ENCRYPTION_KEY_BYTES) {
		return {
			kind: "invalid",
			message: `the key is the wrong size`,
		};
	}
	return { kind: "ok", value: brandString(trimmed, "EncryptionKey") };
}

export function accountId(value: string): ParseResult<AccountId> {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return { kind: "invalid", message: "account id is empty" };
	}
	return { kind: "ok", value: brandString(trimmed, "AccountId") };
}

export function modelSlotId(value: string): ParseResult<ModelSlotId> {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return { kind: "invalid", message: "model slot id is empty" };
	}
	return { kind: "ok", value: brandString(trimmed, "ModelSlotId") };
}

export function newAccountId(): AccountId {
	const suffix = crypto.randomUUID().replaceAll("-", "");
	return brandString(`${ACCOUNT_ID_PREFIX}${suffix}`, "AccountId");
}

export function newModelSlotId(): ModelSlotId {
	const suffix = crypto.randomUUID().replaceAll("-", "");
	return brandString(`${SLOT_ID_PREFIX}${suffix}`, "ModelSlotId");
}

const sealedCredentialSchema: z.ZodType<SealedCredential> = z
	.object(
		{
			accountId: fromParseResult(
				z.unknown().transform((value) => unknownText(value)),
				accountId,
			),
			ciphertext: z.string({
				error: "credential vault account is missing ciphertext or iv",
			}),
			iv: z.string({
				error: "credential vault account is missing ciphertext or iv",
			}),
		},
		{ error: "credential vault account is invalid" },
	)
	.transform((item) => ({
		accountId: item.accountId,
		ciphertext: brandString(item.ciphertext, "Ciphertext"),
		iv: brandString(item.iv, "Iv"),
	}));

const credentialVaultSchema: z.ZodType<CredentialVault> = z.object(
	{
		accounts: z.array(sealedCredentialSchema, {
			error: "credential vault accounts must be an array",
		}),
		version: z.literal(1, {
			error: "credential vault version is unsupported",
		}),
	},
	{ error: "credential vault must be a JSON object" },
);

export function parseCredentialVaultValue(
	parsed: unknown,
): ParseResult<CredentialVault> {
	return parseUnknown(credentialVaultSchema, parsed);
}

export function parseCredentialVault(
	raw: string,
): ParseResult<CredentialVault> {
	return parseJsonText(
		credentialVaultSchema,
		raw,
		"credential vault is not valid JSON",
	);
}

export function serializeCredentialVault(vault: CredentialVault): string {
	return JSON.stringify(vault);
}
