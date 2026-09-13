import { and, asc, eq } from "drizzle-orm";

import type { AppDb } from "#/db/client.ts";
import { firstRow } from "#/db/row.ts";
import { repoModelList, repoModelListMeta } from "#/db/schema.ts";
import {
	parseSelect,
	repoModelListUpdatedSelect,
	repoModelOverrideSelect,
} from "#/db/zod.ts";
import type { ParseResult, RepoRef } from "#/domain.ts";
import { modelSlotId } from "#/vault/domain.ts";
import type { ModelSlot } from "#/vault/model-slot.ts";
import { slotsForRepoView } from "#/vault/resolve-order.ts";
import type { RepoModelListRow } from "#/vault/resolve-order.ts";

import { storeError } from "./rows.ts";
import { listModelSlots, validateSlotIds } from "./slots.ts";
import type { SetRepoModelListArgs, VaultStore } from "./types.ts";

async function readRepoOverrides(
	db: AppDb,
	args: { githubUserId: string; repo: RepoRef },
): Promise<ParseResult<RepoModelListRow[]>> {
	const overrideRows = await db
		.select({
			slotId: repoModelList.slotId,
			sortIndex: repoModelList.sortIndex,
		})
		.from(repoModelList)
		.where(
			and(
				eq(repoModelList.githubUserId, args.githubUserId),
				eq(repoModelList.repoId, args.repo.id),
			),
		)
		.orderBy(asc(repoModelList.sortIndex), asc(repoModelList.slotId));
	const repoOverrides: RepoModelListRow[] = [];
	for (const row of overrideRows) {
		const selected = parseSelect(
			repoModelOverrideSelect,
			row,
			"repo model list row is invalid",
		);
		if (selected.kind === "invalid") {
			return selected;
		}
		const slotId = modelSlotId(selected.value.slotId);
		if (slotId.kind === "invalid") {
			return slotId;
		}
		repoOverrides.push({
			githubUserId: args.githubUserId,
			repo: args.repo,
			slotId: slotId.value,
			sortIndex: selected.value.sortIndex,
		});
	}
	return { kind: "ok", value: repoOverrides };
}

async function readRepoListMeta(
	db: AppDb,
	args: { githubUserId: string; repo: RepoRef },
): Promise<ParseResult<{ updatedAt: number } | undefined>> {
	const meta = await db
		.select({ updatedAt: repoModelListMeta.updatedAt })
		.from(repoModelListMeta)
		.where(
			and(
				eq(repoModelListMeta.githubUserId, args.githubUserId),
				eq(repoModelListMeta.repoId, args.repo.id),
			),
		)
		.limit(1);
	const metaRow = firstRow(meta);
	if (metaRow === undefined) {
		return { kind: "ok", value: undefined };
	}
	return parseSelect(
		repoModelListUpdatedSelect,
		metaRow,
		"repo model list meta row is invalid",
	);
}

export async function listSlotsForRepo(
	db: AppDb,
	args: { githubUserId: string; repo: RepoRef },
): Promise<ParseResult<ModelSlot[]>> {
	try {
		const listed = await listModelSlots(db, {
			githubUserId: args.githubUserId,
		});
		if (listed.kind === "invalid") {
			return listed;
		}
		const meta = await readRepoListMeta(db, args);
		if (meta.kind === "invalid") {
			return meta;
		}
		if (meta.value === undefined) {
			return {
				kind: "ok",
				value: slotsForRepoView({ slots: listed.value }),
			};
		}
		const repoOverrides = await readRepoOverrides(db, args);
		if (repoOverrides.kind === "invalid") {
			return repoOverrides;
		}
		return {
			kind: "ok",
			value: slotsForRepoView({
				repoOverrides: repoOverrides.value,
				slots: listed.value,
			}),
		};
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function writeRepoModelList(
	db: AppDb,
	args: SetRepoModelListArgs & { now: number },
): Promise<void> {
	await db
		.insert(repoModelListMeta)
		.values({
			githubUserId: args.githubUserId,
			repoId: args.repo.id,
			repoName: args.repo.name,
			repoOwner: args.repo.owner,
			updatedAt: args.now,
		})
		.onConflictDoUpdate({
			set: {
				repoName: args.repo.name,
				repoOwner: args.repo.owner,
				updatedAt: args.now,
			},
			target: [repoModelListMeta.githubUserId, repoModelListMeta.repoId],
		});
	await db
		.delete(repoModelList)
		.where(
			and(
				eq(repoModelList.githubUserId, args.githubUserId),
				eq(repoModelList.repoId, args.repo.id),
			),
		);
	if (args.orderedSlotIds.length === 0) {
		return;
	}
	await db.insert(repoModelList).values(
		args.orderedSlotIds.map((slotId, index) => ({
			githubUserId: args.githubUserId,
			repoId: args.repo.id,
			repoName: args.repo.name,
			repoOwner: args.repo.owner,
			slotId,
			sortIndex: index,
			updatedAt: args.now,
		})),
	);
}

async function setRepoModelList(
	db: AppDb,
	args: SetRepoModelListArgs,
): Promise<ParseResult<ModelSlot[]>> {
	try {
		const listed = await listModelSlots(db, {
			githubUserId: args.githubUserId,
		});
		if (listed.kind === "invalid") {
			return listed;
		}
		const valid = validateSlotIds({
			message: "repo model list references an unknown slot",
			orderedSlotIds: args.orderedSlotIds,
			slots: listed.value,
		});
		if (valid.kind === "invalid") {
			return valid;
		}
		await writeRepoModelList(db, { ...args, now: Date.now() });
		return await listSlotsForRepo(db, {
			githubUserId: args.githubUserId,
			repo: args.repo,
		});
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function clearRepoModelList(
	db: AppDb,
	args: { githubUserId: string; repo: RepoRef },
): Promise<ParseResult<ModelSlot[]>> {
	try {
		await db
			.delete(repoModelList)
			.where(
				and(
					eq(repoModelList.githubUserId, args.githubUserId),
					eq(repoModelList.repoId, args.repo.id),
				),
			);
		await db
			.delete(repoModelListMeta)
			.where(
				and(
					eq(repoModelListMeta.githubUserId, args.githubUserId),
					eq(repoModelListMeta.repoId, args.repo.id),
				),
			);
		return await listSlotsForRepo(db, {
			githubUserId: args.githubUserId,
			repo: args.repo,
		});
	} catch (error: unknown) {
		return storeError(error);
	}
}

type RepoModelListStore = Pick<
	VaultStore,
	"clearRepoModelList" | "listSlotsForRepo" | "setRepoModelList"
>;

export function createRepoModelListStore(db: AppDb): RepoModelListStore {
	return {
		clearRepoModelList: async (args) => clearRepoModelList(db, args),
		listSlotsForRepo: async (args) => listSlotsForRepo(db, args),
		setRepoModelList: async (args) => setRepoModelList(db, args),
	};
}
