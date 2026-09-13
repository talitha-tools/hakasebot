import type { ParseResult, RepoId } from "@hakasebot/core/domain.ts";
import type { ModelSlotId } from "@hakasebot/core/vault/domain.ts";
import type { ModelSlot } from "@hakasebot/core/vault/model-slot.ts";
import type { VaultStore } from "@hakasebot/core/vault/store.ts";

import type { UserSessionDeps } from "./accounts.server.ts";
import { repoFromEnabled } from "./repos-context.server.ts";

export async function listRepoModelSlots(
	args: UserSessionDeps & { repoId: RepoId; store?: VaultStore },
): Promise<ParseResult<ModelSlot[]>> {
	const resolved = await repoFromEnabled(args);
	if (resolved.kind === "invalid") {
		return resolved;
	}
	return resolved.value.store.listSlotsForRepo({
		githubUserId: resolved.value.githubUserId,
		repo: resolved.value.repo,
	});
}

export async function setRepoModelList(
	args: UserSessionDeps & {
		orderedSlotIds: readonly ModelSlotId[];
		repoId: RepoId;
		store?: VaultStore;
	},
): Promise<ParseResult<ModelSlot[]>> {
	const resolved = await repoFromEnabled(args);
	if (resolved.kind === "invalid") {
		return resolved;
	}
	return resolved.value.store.setRepoModelList({
		githubUserId: resolved.value.githubUserId,
		orderedSlotIds: args.orderedSlotIds,
		repo: resolved.value.repo,
	});
}

export async function clearRepoModelList(
	args: UserSessionDeps & { repoId: RepoId; store?: VaultStore },
): Promise<ParseResult<ModelSlot[]>> {
	const resolved = await repoFromEnabled(args);
	if (resolved.kind === "invalid") {
		return resolved;
	}
	return resolved.value.store.clearRepoModelList({
		githubUserId: resolved.value.githubUserId,
		repo: resolved.value.repo,
	});
}
