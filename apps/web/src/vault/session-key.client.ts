import type { EncryptionKey } from "@hakasebot/core/vault/domain.ts";
import { encryptionKey } from "@hakasebot/core/vault/domain.ts";

const STORAGE_PREFIX = "hakasebot:encryption-key:user:";
const STAGED_PREFIX = "hakasebot:encryption-key-staged:user:";
const ACK_PREFIX = "hakasebot:vault-ceremony-ack:user:";

function storageKey(githubUserId: string): string {
	return `${STORAGE_PREFIX}${githubUserId}`;
}

function ackKey(githubUserId: string): string {
	return `${ACK_PREFIX}${githubUserId}`;
}

function stagedKey(githubUserId: string): string {
	return `${STAGED_PREFIX}${githubUserId}`;
}

export function loadEncryptionKey(
	githubUserId: string,
): EncryptionKey | undefined {
	const existing = sessionStorage.getItem(storageKey(githubUserId));
	if (typeof existing !== "string") {
		return undefined;
	}
	const parsed = encryptionKey(existing);
	return parsed.kind === "ok" ? parsed.value : undefined;
}

export function clearEncryptionKey(githubUserId: string): void {
	sessionStorage.removeItem(storageKey(githubUserId));
}

export function exportEncryptionKey(
	githubUserId: string,
): EncryptionKey | undefined {
	return loadEncryptionKey(githubUserId);
}

export function importEncryptionKey(args: {
	githubUserId: string;
	key: EncryptionKey;
}): void {
	sessionStorage.setItem(storageKey(args.githubUserId), args.key);
}

export function readCeremonyAck(githubUserId: string): boolean {
	return sessionStorage.getItem(ackKey(githubUserId)) === "1";
}

export function writeCeremonyAck(githubUserId: string): void {
	sessionStorage.setItem(ackKey(githubUserId), "1");
}

export function clearCeremonyAck(githubUserId: string): void {
	sessionStorage.removeItem(ackKey(githubUserId));
}

export function stageEncryptionKeyForRotate(args: {
	githubUserId: string;
	key: EncryptionKey;
}): void {
	sessionStorage.setItem(stagedKey(args.githubUserId), args.key);
}

export function loadStagedEncryptionKey(
	githubUserId: string,
): EncryptionKey | undefined {
	const existing = sessionStorage.getItem(stagedKey(githubUserId));
	if (typeof existing !== "string") {
		return undefined;
	}
	const parsed = encryptionKey(existing);
	return parsed.kind === "ok" ? parsed.value : undefined;
}

export function commitStagedEncryptionKey(
	githubUserId: string,
): EncryptionKey | undefined {
	const staged = loadStagedEncryptionKey(githubUserId);
	if (staged === undefined) {
		return undefined;
	}
	importEncryptionKey({ githubUserId, key: staged });
	sessionStorage.removeItem(stagedKey(githubUserId));
	clearCeremonyAck(githubUserId);
	return staged;
}

export function discardStagedEncryptionKey(githubUserId: string): void {
	sessionStorage.removeItem(stagedKey(githubUserId));
}

/** Wipe every browser-local Account deletion remnant for this User. */
export function clearBrowserAccountLocalState(githubUserId: string): void {
	clearEncryptionKey(githubUserId);
	discardStagedEncryptionKey(githubUserId);
	clearCeremonyAck(githubUserId);
}
