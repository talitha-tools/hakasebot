import type { RepoRef } from "#/domain.ts";

import type { AccountId, ModelSlotId, SealedCredential } from "./domain.ts";
import type { ModelSlot } from "./model-slot.ts";

export interface RepoModelListRow {
	githubUserId: string;
	repo: RepoRef;
	slotId: ModelSlotId;
	sortIndex: number;
}

/**
 * `repoOverrides: undefined` — use all slots in defaultSortIndex order.
 * `repoOverrides: []` — explicit empty allowlist (no slots for this repo).
 * Non-empty — allowlist in repo sort order.
 */
export function mergeSlotOrder(args: {
	slots: readonly { defaultSortIndex: number; id: ModelSlotId }[];
	repoOverrides?: readonly { slotId: ModelSlotId; sortIndex: number }[];
}): ModelSlotId[] {
	if (args.repoOverrides !== undefined) {
		return [...args.repoOverrides]
			.toSorted(
				(left, right) =>
					left.sortIndex - right.sortIndex ||
					left.slotId.localeCompare(right.slotId),
			)
			.map((row) => row.slotId);
	}
	return [...args.slots]
		.toSorted(
			(left, right) =>
				left.defaultSortIndex - right.defaultSortIndex ||
				left.id.localeCompare(right.id),
		)
		.map((row) => row.id);
}

export function slotsForRepoView(args: {
	slots: readonly ModelSlot[];
	repoOverrides?: readonly RepoModelListRow[];
}): ModelSlot[] {
	const overrideRows =
		args.repoOverrides === undefined
			? undefined
			: args.repoOverrides.map((row) => ({
					slotId: row.slotId,
					sortIndex: row.sortIndex,
				}));
	const order = mergeSlotOrder({
		slots: args.slots.map((slot) => ({
			defaultSortIndex: slot.defaultSortIndex,
			id: slot.id,
		})),
		...(overrideRows === undefined ? {} : { repoOverrides: overrideRows }),
	});
	const byId = new Map(args.slots.map((slot) => [slot.id, slot]));
	return order.flatMap((id) => {
		const slot = byId.get(id);
		return slot === undefined ? [] : [slot];
	});
}

export function credentialVaultForSlots(args: {
	accounts: readonly { id: AccountId; sealed: SealedCredential }[];
	slotAccountIds: readonly AccountId[];
}): SealedCredential[] {
	const needed = new Set(args.slotAccountIds);
	return args.accounts
		.filter((row) => needed.has(row.id))
		.map((row) => row.sealed);
}
