import { and, asc, eq } from "drizzle-orm";

import type { AppDb } from "#/db/client.ts";
import { firstRow } from "#/db/row.ts";
import {
	enabledRepos,
	repoModelList,
	repoModelListMeta,
	repoSettingDefaults,
} from "#/db/schema.ts";
import { parseSelect, repoSettingDefaultsSelect } from "#/db/zod.ts";
import type { ParseResult, RepoId } from "#/domain.ts";
import {
	productRepoSettingDefaults,
	repoSettingDefaultsFromRow,
} from "#/wake/domain.ts";
import type { RepoSettingDefaults } from "#/wake/domain.ts";

import { parseEnabledRepoRow } from "./enabled-row.ts";
import { storeError } from "./rows.ts";
import type {
	EnabledRepoRow,
	MarkRepoSyncedArgs,
	VaultStore,
} from "./types.ts";

/** Read one enabled repo back after a write; the caller's try/catch owns errors. */
export async function readEnabledRepoRow(args: {
	db: AppDb;
	githubUserId: string;
	missingMessage?: string;
	repoId: RepoId;
}): Promise<ParseResult<EnabledRepoRow>> {
	const rows = await args.db
		.select()
		.from(enabledRepos)
		.where(
			and(
				eq(enabledRepos.githubUserId, args.githubUserId),
				eq(enabledRepos.repoId, args.repoId),
			),
		)
		.limit(1);
	const row = firstRow(rows);
	if (row === undefined) {
		return {
			kind: "invalid",
			message: args.missingMessage ?? "enabled repo not found",
		};
	}
	return parseEnabledRepoRow(row);
}

async function markEnabledRepoTimestamp(args: {
	at: number;
	column: "homeAt" | "botAt";
	db: AppDb;
	githubUserId: string;
	repoId: RepoId;
}): Promise<ParseResult<EnabledRepoRow>> {
	try {
		await args.db
			.update(enabledRepos)
			.set(args.column === "homeAt" ? { homeAt: args.at } : { botAt: args.at })
			.where(
				and(
					eq(enabledRepos.githubUserId, args.githubUserId),
					eq(enabledRepos.repoId, args.repoId),
				),
			);
		return await readEnabledRepoRow({
			db: args.db,
			githubUserId: args.githubUserId,
			repoId: args.repoId,
		});
	} catch (error: unknown) {
		return storeError(error);
	}
}

export async function getRepoSettingDefaults(
	db: AppDb,
	args: { githubUserId: string },
): Promise<ParseResult<RepoSettingDefaults>> {
	try {
		const rows = await db
			.select({
				autoAuthors: repoSettingDefaults.autoAuthors,
				autoBranches: repoSettingDefaults.autoBranches,
				autoReviewCadence: repoSettingDefaults.autoReviewCadence,
				wakeMode: repoSettingDefaults.wakeMode,
			})
			.from(repoSettingDefaults)
			.where(eq(repoSettingDefaults.githubUserId, args.githubUserId))
			.limit(1);
		const row = firstRow(rows);
		if (row === undefined) {
			return { kind: "ok", value: productRepoSettingDefaults() };
		}
		const selected = parseSelect(
			repoSettingDefaultsSelect,
			row,
			"repo setting defaults row is invalid",
		);
		if (selected.kind === "invalid") {
			return selected;
		}
		return {
			kind: "ok",
			value: repoSettingDefaultsFromRow(selected.value),
		};
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function setRepoSettingDefaults(
	db: AppDb,
	args: { githubUserId: string; defaults: RepoSettingDefaults },
): Promise<ParseResult<RepoSettingDefaults>> {
	try {
		await db
			.insert(repoSettingDefaults)
			.values({
				autoAuthors: args.defaults.autoAuthorScope,
				autoBranches: args.defaults.autoBranchScope,
				autoReviewCadence: args.defaults.autoReviewCadence,
				githubUserId: args.githubUserId,
				wakeMode: args.defaults.wakeMode,
			})
			.onConflictDoUpdate({
				set: {
					autoAuthors: args.defaults.autoAuthorScope,
					autoBranches: args.defaults.autoBranchScope,
					autoReviewCadence: args.defaults.autoReviewCadence,
					wakeMode: args.defaults.wakeMode,
				},
				target: repoSettingDefaults.githubUserId,
			});
		return await getRepoSettingDefaults(db, {
			githubUserId: args.githubUserId,
		});
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function enableRepo(
	db: AppDb,
	args: { githubUserId: string; repo: EnabledRepoRow["repo"] },
): Promise<ParseResult<EnabledRepoRow>> {
	try {
		const defaults = await getRepoSettingDefaults(db, {
			githubUserId: args.githubUserId,
		});
		if (defaults.kind === "invalid") {
			return defaults;
		}
		await db
			.insert(enabledRepos)
			.values({
				autoAuthors: defaults.value.autoAuthorScope,
				autoBranches: defaults.value.autoBranchScope,
				autoReviewCadence: defaults.value.autoReviewCadence,
				githubUserId: args.githubUserId,
				repoId: args.repo.id,
				repoName: args.repo.name,
				repoOwner: args.repo.owner,
				syncedEpoch: 0,
				wakeMode: defaults.value.wakeMode,
			})
			.onConflictDoNothing();
		return await readEnabledRepoRow({
			db,
			githubUserId: args.githubUserId,
			missingMessage: "enabled repo row missing after insert",
			repoId: args.repo.id,
		});
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function disableRepo(
	db: AppDb,
	args: { githubUserId: string; repo: EnabledRepoRow["repo"] },
): Promise<ParseResult<void>> {
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
		await db
			.delete(enabledRepos)
			.where(
				and(
					eq(enabledRepos.githubUserId, args.githubUserId),
					eq(enabledRepos.repoId, args.repo.id),
				),
			);
		return { kind: "ok", value: undefined };
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function listEnabledRepos(
	db: AppDb,
	args: { githubUserId: string },
): Promise<ParseResult<EnabledRepoRow[]>> {
	try {
		const rows = await db
			.select()
			.from(enabledRepos)
			.where(eq(enabledRepos.githubUserId, args.githubUserId))
			.orderBy(asc(enabledRepos.repoOwner), asc(enabledRepos.repoName));
		const repos: EnabledRepoRow[] = [];
		for (const row of rows) {
			const parsed = parseEnabledRepoRow(row);
			if (parsed.kind === "invalid") {
				return parsed;
			}
			repos.push(parsed.value);
		}
		return { kind: "ok", value: repos };
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function markRepoSynced(
	db: AppDb,
	args: MarkRepoSyncedArgs,
): Promise<ParseResult<EnabledRepoRow>> {
	try {
		await db
			.update(enabledRepos)
			.set({ lastSyncedAt: Date.now(), syncedEpoch: args.epoch })
			.where(
				and(
					eq(enabledRepos.githubUserId, args.githubUserId),
					eq(enabledRepos.repoId, args.repo.id),
				),
			);
		return await readEnabledRepoRow({
			db,
			githubUserId: args.githubUserId,
			repoId: args.repo.id,
		});
	} catch (error: unknown) {
		return storeError(error);
	}
}

type EnabledRepoStore = Pick<
	VaultStore,
	| "disableRepo"
	| "enableRepo"
	| "getRepoSettingDefaults"
	| "listEnabledRepos"
	| "markHomeDispatcherAt"
	| "markRepoBotAt"
	| "markRepoSynced"
	| "setRepoSettingDefaults"
>;

export function createEnabledRepoStore(db: AppDb): EnabledRepoStore {
	return {
		disableRepo: async (args) => disableRepo(db, args),
		enableRepo: async (args) => enableRepo(db, args),
		getRepoSettingDefaults: async (args) => getRepoSettingDefaults(db, args),
		listEnabledRepos: async (args) => listEnabledRepos(db, args),
		markHomeDispatcherAt: async (args) =>
			markEnabledRepoTimestamp({
				at: args.at,
				column: "homeAt",
				db,
				githubUserId: args.githubUserId,
				repoId: args.repo.id,
			}),
		markRepoBotAt: async (args) =>
			markEnabledRepoTimestamp({
				at: args.at,
				column: "botAt",
				db,
				githubUserId: args.githubUserId,
				repoId: args.repo.id,
			}),
		markRepoSynced: async (args) => markRepoSynced(db, args),
		setRepoSettingDefaults: async (args) => setRepoSettingDefaults(db, args),
	};
}
