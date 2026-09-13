import type { ParseResult } from "@hakasebot/core/domain.ts";
import type {
	AccountId,
	ModelSlotId,
	SealedCredential,
} from "@hakasebot/core/vault/domain.ts";
import { accountId, modelSlotId } from "@hakasebot/core/vault/domain.ts";
import { parseModelSlotInput } from "@hakasebot/core/vault/model-slot.ts";
import type {
	ModelSlot,
	SaveModelSlotArgs,
} from "@hakasebot/core/vault/model-slot.ts";
import type { VaultStore } from "@hakasebot/core/vault/store.ts";

import type { UserSessionDeps } from "./accounts.server.ts";
import { userGithubUserId, vaultStoreOrInvalid } from "./accounts.server.ts";

export function parseSaveModelSlotInput(input: {
	accountId: string;
	engine: string;
	model: string;
	label: string;
	defaultSortIndex: number;
	effort?: string;
	fast?: boolean;
	similarModel?: boolean;
	slotId?: string;
}): ParseResult<Omit<SaveModelSlotArgs, "githubUserId">> {
	const parsedAccountId = accountId(input.accountId);
	if (parsedAccountId.kind === "invalid") {
		return parsedAccountId;
	}
	return parseModelSlotInput({
		accountId: parsedAccountId.value,
		defaultSortIndex: input.defaultSortIndex,
		engine: input.engine,
		label: input.label,
		model: input.model,
		...(input.fast === undefined ? {} : { fast: input.fast }),
		...(input.similarModel === undefined
			? {}
			: { similarModel: input.similarModel }),
		...(input.effort === undefined ? {} : { effort: input.effort }),
		...(input.slotId === undefined ? {} : { slotId: input.slotId }),
	});
}

export function parseDeleteModelSlotInput(input: {
	id: string;
}): ParseResult<ModelSlotId> {
	return modelSlotId(input.id);
}

export function parseSetDefaultSlotOrderInput(input: {
	orderedSlotIds: string[];
}): ParseResult<readonly ModelSlotId[]> {
	const ordered: ModelSlotId[] = [];
	for (const raw of input.orderedSlotIds) {
		const parsed = modelSlotId(raw);
		if (parsed.kind === "invalid") {
			return parsed;
		}
		ordered.push(parsed.value);
	}
	return { kind: "ok", value: ordered };
}

async function storeForUser(
	args: UserSessionDeps & { store?: VaultStore },
): Promise<ParseResult<VaultStore>> {
	if (args.store !== undefined) {
		return { kind: "ok", value: args.store };
	}
	return vaultStoreOrInvalid();
}

export async function listModelSlots(
	args: UserSessionDeps & { store?: VaultStore },
): Promise<ParseResult<ModelSlot[]>> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store = await storeForUser(args);
	if (store.kind === "invalid") {
		return store;
	}
	return store.value.listModelSlots({
		githubUserId: githubUserId.value,
	});
}

export async function saveModelSlot(
	args: UserSessionDeps & {
		input: Omit<SaveModelSlotArgs, "githubUserId">;
		store?: VaultStore;
	},
): Promise<ParseResult<ModelSlot>> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store = await storeForUser(args);
	if (store.kind === "invalid") {
		return store;
	}
	const saved = await store.value.saveModelSlot({
		...args.input,
		githubUserId: githubUserId.value,
	});
	if (saved.kind === "invalid") {
		return saved;
	}
	return saved;
}

export async function deleteModelSlot(
	args: UserSessionDeps & {
		id: ModelSlotId;
		store?: VaultStore;
	},
): Promise<ParseResult<void>> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store = await storeForUser(args);
	if (store.kind === "invalid") {
		return store;
	}
	const deleted = await store.value.deleteModelSlot({
		githubUserId: githubUserId.value,
		id: args.id,
	});
	if (deleted.kind === "invalid") {
		return deleted;
	}
	return deleted;
}

export async function setDefaultModelSlotOrder(
	args: UserSessionDeps & {
		orderedSlotIds: readonly ModelSlotId[];
		store?: VaultStore;
	},
): Promise<ParseResult<ModelSlot[]>> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store = await storeForUser(args);
	if (store.kind === "invalid") {
		return store;
	}
	const ordered = await store.value.setDefaultSlotOrder({
		githubUserId: githubUserId.value,
		orderedSlotIds: args.orderedSlotIds,
	});
	if (ordered.kind === "invalid") {
		return ordered;
	}
	return ordered;
}

export async function getVaultAccountSealed(
	args: UserSessionDeps & {
		id: AccountId;
		store?: VaultStore;
	},
): Promise<
	ParseResult<{
		engine: SaveModelSlotArgs["engine"];
		sealed: SealedCredential;
	}>
> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store = await storeForUser(args);
	if (store.kind === "invalid") {
		return store;
	}
	const row = await store.value.getAccount({
		githubUserId: githubUserId.value,
		id: args.id,
	});
	if (row.kind === "invalid") {
		return row;
	}
	return {
		kind: "ok",
		value: {
			engine: row.value.engine,
			sealed: row.value.sealed,
		},
	};
}
