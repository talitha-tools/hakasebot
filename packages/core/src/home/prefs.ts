import type { ParseResult, RepoRef } from "#/domain.ts";
import type { CredentialVault } from "#/vault/domain.ts";
import {
	modelSlotId,
	parseCredentialVault,
	parseCredentialVaultValue,
} from "#/vault/domain.ts";
import type { ModelSlot } from "#/vault/model-slot.ts";

import type { HomePrefsFile, HomeRepoAllowlist } from "./prefs-file.ts";

export type { HomePrefsFile, HomeRepoAllowlist } from "./prefs-file.ts";
export {
	parseHomePrefs,
	parseHomePrefsValue,
	serializeHomePrefs,
} from "./prefs-file.ts";

export const HOME_DISPATCHER_PATH = ".github/workflows/home-review.yml";

export function serializeHomeVault(vault: CredentialVault): string {
	return `${JSON.stringify(vault, undefined, 2)}\n`;
}

export function parseHomeVault(raw: string): ParseResult<CredentialVault> {
	return parseCredentialVault(raw);
}

export function parseHomeVaultValue(
	parsed: unknown,
): ParseResult<CredentialVault> {
	return parseCredentialVaultValue(parsed);
}

export function repoPrefsForConsumer(args: {
	consumer: RepoRef;
	prefs: HomePrefsFile;
}): HomeRepoAllowlist | undefined {
	return args.prefs.repos.find((row) => row.repo.id === args.consumer.id);
}

export function slotsForConsumer(args: {
	consumer: RepoRef;
	prefs: HomePrefsFile;
}): readonly ModelSlot[] {
	const allow = repoPrefsForConsumer(args);
	if (allow === undefined) {
		return [];
	}
	if (allow.slotIds === undefined) {
		return [...args.prefs.slots].toSorted(
			(left, right) => left.defaultSortIndex - right.defaultSortIndex,
		);
	}
	const byId = new Map(args.prefs.slots.map((slot) => [slot.id, slot]));
	const ordered: ModelSlot[] = [];
	for (const id of allow.slotIds) {
		const parsed = modelSlotId(id);
		if (parsed.kind === "invalid") {
			continue;
		}
		const slot = byId.get(parsed.value);
		if (slot !== undefined) {
			ordered.push(slot);
		}
	}
	return ordered;
}
