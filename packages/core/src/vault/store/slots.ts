import { and, asc, eq } from "drizzle-orm";

import { d1Bindable } from "#/d1.ts";
import type { AppDb } from "#/db/client.ts";
import { firstRow } from "#/db/row.ts";
import { modelSlots } from "#/db/schema.ts";
import { modelSlotCreatedAtSelect, parseSelect } from "#/db/zod.ts";
import type { EngineKind, ParseResult } from "#/domain.ts";
import { modelSlotId } from "#/vault/domain.ts";
import type { AccountId, ModelSlotId } from "#/vault/domain.ts";
import { parseModelSlotInput } from "#/vault/model-slot.ts";
import type { ModelSlot, SaveModelSlotArgs } from "#/vault/model-slot.ts";

import { getVaultAccount } from "./accounts.ts";
import { storeError } from "./rows.ts";
import { parseModelSlotRow } from "./slot-row.ts";
import type { VaultStore } from "./types.ts";

export async function listModelSlots(
	db: AppDb,
	args: { githubUserId: string },
): Promise<ParseResult<ModelSlot[]>> {
	try {
		const rows = await db
			.select()
			.from(modelSlots)
			.where(eq(modelSlots.githubUserId, args.githubUserId))
			.orderBy(asc(modelSlots.defaultSortIndex), asc(modelSlots.createdAt));
		const slots: ModelSlot[] = [];
		for (const row of rows) {
			const parsed = parseModelSlotRow(row);
			if (parsed.kind === "invalid") {
				return parsed;
			}
			slots.push(parsed.value);
		}
		return { kind: "ok", value: slots };
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function requireAccountEngine(
	db: AppDb,
	args: { engine: EngineKind; githubUserId: string; id: AccountId },
): Promise<ParseResult<undefined>> {
	const account = await getVaultAccount(db, {
		githubUserId: args.githubUserId,
		id: args.id,
	});
	if (account.kind === "invalid") {
		return account;
	}
	if (account.value.engine !== args.engine) {
		return {
			kind: "invalid",
			message: "model slot engine does not match vault account",
		};
	}
	return { kind: "ok", value: undefined };
}

type SlotWrite = Omit<SaveModelSlotArgs, "githubUserId"> & {
	slotId: ModelSlotId;
};

function parseSaveModelSlotArgs(args: SaveModelSlotArgs) {
	return parseModelSlotInput({
		accountId: args.accountId,
		defaultSortIndex: args.defaultSortIndex,
		engine: args.engine,
		label: args.label,
		model: args.model,
		...(args.fast === undefined ? {} : { fast: args.fast }),
		...(args.similarModel === undefined
			? {}
			: { similarModel: args.similarModel }),
		...(args.effort === undefined ? {} : { effort: args.effort }),
		...(args.slotId === undefined ? {} : { slotId: args.slotId }),
	});
}

async function writeModelSlotRow(args: {
	createdAt: number;
	db: AppDb;
	existing: boolean;
	githubUserId: string;
	now: number;
	slot: SlotWrite;
}): Promise<void> {
	const { slot } = args;
	const fields = {
		accountId: slot.accountId,
		defaultSortIndex: slot.defaultSortIndex,
		engine: slot.engine,
		effort: d1Bindable(slot.effort),
		fast: slot.fast ? 1 : 0,
		label: slot.label,
		model: slot.model,
		similarModel: slot.similarModel ? 1 : 0,
		updatedAt: args.now,
	};
	if (args.existing) {
		await args.db
			.update(modelSlots)
			.set(fields)
			.where(
				and(
					eq(modelSlots.githubUserId, args.githubUserId),
					eq(modelSlots.id, slot.slotId),
				),
			);
		return;
	}
	await args.db.insert(modelSlots).values({
		...fields,
		createdAt: args.createdAt,
		githubUserId: args.githubUserId,
		id: slot.slotId,
	});
}

function savedModelSlot(createdAt: number, slot: SlotWrite): ModelSlot {
	return {
		accountId: slot.accountId,
		createdAt,
		defaultSortIndex: slot.defaultSortIndex,
		engine: slot.engine,
		fast: slot.fast ?? false,
		id: slot.slotId,
		label: slot.label,
		model: slot.model,
		similarModel: slot.similarModel ?? true,
		...(slot.effort === undefined ? {} : { effort: slot.effort }),
	};
}

async function existingSlotCreatedAt(
	db: AppDb,
	args: { githubUserId: string; now: number; slotId: ModelSlotId },
): Promise<ParseResult<{ createdAt: number; existing: boolean }>> {
	const existing = await db
		.select({ createdAt: modelSlots.createdAt })
		.from(modelSlots)
		.where(
			and(
				eq(modelSlots.githubUserId, args.githubUserId),
				eq(modelSlots.id, args.slotId),
			),
		)
		.limit(1);
	const existingRow = firstRow(existing);
	if (existingRow === undefined) {
		return { kind: "ok", value: { createdAt: args.now, existing: false } };
	}
	const selected = parseSelect(
		modelSlotCreatedAtSelect,
		existingRow,
		"model slot row is invalid",
	);
	if (selected.kind === "invalid") {
		return selected;
	}
	const { createdAt } = selected.value;
	return { kind: "ok", value: { createdAt, existing: true } };
}

async function saveModelSlot(
	db: AppDb,
	args: SaveModelSlotArgs,
): Promise<ParseResult<ModelSlot>> {
	try {
		const parsed = parseSaveModelSlotArgs(args);
		if (parsed.kind === "invalid") {
			return parsed;
		}
		const account = await requireAccountEngine(db, {
			engine: parsed.value.engine,
			githubUserId: args.githubUserId,
			id: parsed.value.accountId,
		});
		if (account.kind === "invalid") {
			return account;
		}
		const now = Date.now();
		const { slotId } = parsed.value;
		if (slotId === undefined) {
			return { kind: "invalid", message: "model slot id is missing" };
		}
		const existing = await existingSlotCreatedAt(db, {
			githubUserId: args.githubUserId,
			now,
			slotId,
		});
		if (existing.kind === "invalid") {
			return existing;
		}
		const { createdAt } = existing.value;
		const slot: SlotWrite = { ...parsed.value, slotId };
		await writeModelSlotRow({
			createdAt,
			db,
			existing: existing.value.existing,
			githubUserId: args.githubUserId,
			now,
			slot,
		});
		return { kind: "ok", value: savedModelSlot(createdAt, slot) };
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function deleteModelSlot(
	db: AppDb,
	args: { githubUserId: string; id: ModelSlotId },
): Promise<ParseResult<void>> {
	try {
		const id = modelSlotId(args.id);
		if (id.kind === "invalid") {
			return id;
		}
		await db
			.delete(modelSlots)
			.where(
				and(
					eq(modelSlots.githubUserId, args.githubUserId),
					eq(modelSlots.id, id.value),
				),
			);
		return { kind: "ok", value: undefined };
	} catch (error: unknown) {
		return storeError(error);
	}
}

export function validateSlotIds(args: {
	message: string;
	orderedSlotIds: readonly ModelSlotId[];
	slots: readonly ModelSlot[];
}): ParseResult<undefined> {
	const existingIds = new Set(args.slots.map((slot) => slot.id));
	for (const slotId of args.orderedSlotIds) {
		const parsed = modelSlotId(slotId);
		if (parsed.kind === "invalid") {
			return parsed;
		}
		if (!existingIds.has(parsed.value)) {
			return { kind: "invalid", message: args.message };
		}
	}
	return { kind: "ok", value: undefined };
}

async function setDefaultSlotOrder(
	db: AppDb,
	args: { githubUserId: string; orderedSlotIds: readonly ModelSlotId[] },
): Promise<ParseResult<ModelSlot[]>> {
	try {
		const listed = await listModelSlots(db, {
			githubUserId: args.githubUserId,
		});
		if (listed.kind === "invalid") {
			return listed;
		}
		if (args.orderedSlotIds.length !== listed.value.length) {
			return {
				kind: "invalid",
				message: "slot order must include every model slot once",
			};
		}
		const valid = validateSlotIds({
			message: "slot order references an unknown model slot",
			orderedSlotIds: args.orderedSlotIds,
			slots: listed.value,
		});
		if (valid.kind === "invalid") {
			return valid;
		}
		const now = Date.now();
		await Promise.all(
			args.orderedSlotIds.map(async (slotId, index) => {
				await db
					.update(modelSlots)
					.set({ defaultSortIndex: index, updatedAt: now })
					.where(
						and(
							eq(modelSlots.githubUserId, args.githubUserId),
							eq(modelSlots.id, slotId),
						),
					);
			}),
		);
		return await listModelSlots(db, { githubUserId: args.githubUserId });
	} catch (error: unknown) {
		return storeError(error);
	}
}

type ModelSlotStore = Pick<
	VaultStore,
	"deleteModelSlot" | "listModelSlots" | "saveModelSlot" | "setDefaultSlotOrder"
>;

export function createModelSlotStore(db: AppDb): ModelSlotStore {
	return {
		deleteModelSlot: async (args) => deleteModelSlot(db, args),
		listModelSlots: async (args) => listModelSlots(db, args),
		saveModelSlot: async (args) => saveModelSlot(db, args),
		setDefaultSlotOrder: async (args) => setDefaultSlotOrder(db, args),
	};
}
