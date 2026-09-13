import type { ParseResult } from "@hakasebot/core/domain.ts";
import { errorMessage } from "@hakasebot/core/error-message.ts";
import { decryptCredential } from "@hakasebot/core/vault/crypto.ts";
import type {
	CredentialVault,
	EncryptionKey,
} from "@hakasebot/core/vault/domain.ts";
import {
	parseCredentialVault,
	encryptionKey,
} from "@hakasebot/core/vault/domain.ts";
import type {
	ModelQueue,
	ModelQueueEntry,
} from "@hakasebot/core/vault/model-slot.ts";
import { parseModelQueue } from "@hakasebot/core/vault/model-slot.ts";
import { validateCredentialPlaintext } from "@hakasebot/core/vault/parse-credential.ts";

export interface ResolvedModelAttempt {
	entry: ModelQueueEntry;
	plaintext: string;
}

export async function resolveModelAttempt(args: {
	entry: ModelQueueEntry;
	encryptionKey: EncryptionKey;
	credentialVault: CredentialVault;
}): Promise<ParseResult<ResolvedModelAttempt>> {
	const sealed = args.credentialVault.accounts.find(
		(row) => row.accountId === args.entry.accountId,
	);
	if (sealed === undefined) {
		return {
			kind: "invalid",
			message: `no credential for account ${args.entry.accountId}`,
		};
	}
	const opened = await decryptCredential({
		sealed,
		encryptionKey: args.encryptionKey,
	});
	if (opened.kind === "invalid") {
		return opened;
	}
	const valid = validateCredentialPlaintext({
		engine: args.entry.engine,
		plaintext: opened.value,
	});
	if (valid.kind === "invalid") {
		return valid;
	}
	return {
		kind: "ok",
		value: { entry: args.entry, plaintext: opened.value },
	};
}

export function isAuthFailureMessage(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes("401") ||
		lower.includes("403") ||
		lower.includes("unauthorized") ||
		lower.includes("invalid token") ||
		lower.includes("authentication") ||
		lower.includes("oauth")
	);
}

export type ModelAttempt<T> =
	| { kind: "ok"; value: T; slotId: ModelQueueEntry["slotId"] }
	| { kind: "exhausted"; message: string };

export async function withModelQueueFallback<T>(args: {
	queue: ModelQueue;
	encryptionKey: EncryptionKey;
	credentialVault: CredentialVault;
	run: (attempt: ResolvedModelAttempt) => Promise<T>;
	isRetryable: (error: unknown) => boolean;
}): Promise<ModelAttempt<T>> {
	let lastMessage = "model queue is empty";
	for (const entry of args.queue.entries) {
		// oxlint-disable-next-line eslint/no-await-in-loop -- fallback queue: only decrypt the next slot after the prior one fails
		const attempt = await resolveModelAttempt({
			credentialVault: args.credentialVault,
			entry,
			encryptionKey: args.encryptionKey,
		});
		if (attempt.kind === "invalid") {
			lastMessage = attempt.message;
			continue;
		}
		try {
			// oxlint-disable-next-line eslint/no-await-in-loop -- fallback queue: run one credential at a time, in preference order
			const value = await args.run(attempt.value);
			return { kind: "ok", slotId: entry.slotId, value };
		} catch (error) {
			lastMessage = errorMessage(error, "model attempt failed");
			if (!args.isRetryable(error)) {
				return { kind: "exhausted", message: lastMessage };
			}
		}
	}
	return { kind: "exhausted", message: lastMessage };
}

export function loadRuntimeVault(args: {
	encryptionKeyRaw: string;
	credentialVaultRaw: string;
	modelQueueRaw: string;
}): ParseResult<{
	encryptionKey: EncryptionKey;
	credentialVault: CredentialVault;
	modelQueue: ModelQueue;
}> {
	const key = encryptionKey(args.encryptionKeyRaw);
	if (key.kind === "invalid") {
		return key;
	}
	const credentialVault = parseCredentialVault(args.credentialVaultRaw);
	if (credentialVault.kind === "invalid") {
		return credentialVault;
	}
	const modelQueue = parseModelQueue(args.modelQueueRaw);
	if (modelQueue.kind === "invalid") {
		return modelQueue;
	}
	return {
		kind: "ok",
		value: {
			credentialVault: credentialVault.value,
			modelQueue: modelQueue.value,
			encryptionKey: key.value,
		},
	};
}
