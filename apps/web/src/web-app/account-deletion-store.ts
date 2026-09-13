import type { AppDb } from "@hakasebot/core/db/client.ts";
import { firstRow, countedNumber } from "@hakasebot/core/db/row.ts";
import {
	enabledRepos,
	encryptionKeyMeta,
	homeRepos,
	modelSlots,
	repoModelListMeta,
	repoRoutes,
	repoSettingDefaults,
	vaultAccounts,
	wakeRuns,
} from "@hakasebot/core/db/schema.ts";
import { homeRepoRefSelect, parseSelect } from "@hakasebot/core/db/zod.ts";
import type { ParseResult, RepoRef } from "@hakasebot/core/domain.ts";
import { errorMessage } from "@hakasebot/core/error-message.ts";
import { parseRepoDbRow } from "@hakasebot/core/vault/store/rows.ts";
import { and, count, eq, isNull, or, sql } from "drizzle-orm";

import { m as msg } from "#/paraglide/messages.js";

export interface AccountDeletionPreview {
	enabledRepoCount: number;
	homeRepo: RepoRef | undefined;
	repoClaimCount: number;
	vaultAccountCount: number;
	modelSlotCount: number;
	wakeRunCount: number;
}

export interface AccountDeletionStore {
	deleteAccount: (args: { githubUserId: string }) => Promise<ParseResult<void>>;
	previewAccountDeletion: (args: {
		githubUserId: string;
	}) => Promise<ParseResult<AccountDeletionPreview>>;
}

function storeError(error: unknown): ParseResult<never> {
	return {
		kind: "invalid",
		message: errorMessage(error, msg.account_deletion_store_failed()),
	};
}

function legacyWakeWhere(githubUserId: string) {
	const enabledIds = sql`${wakeRuns.consumerRepoId} IN (SELECT ${enabledRepos.repoId} FROM ${enabledRepos} WHERE ${enabledRepos.githubUserId} = ${githubUserId})`;
	const routedIds = sql`${wakeRuns.consumerRepoId} IN (SELECT ${repoRoutes.repoId} FROM ${repoRoutes} WHERE ${repoRoutes.githubUserId} = ${githubUserId})`;
	return and(isNull(wakeRuns.githubUserId), or(enabledIds, routedIds));
}

async function counted(rows: Promise<{ value: number }[]>): Promise<number> {
	return countedNumber(await rows);
}

async function countLegacyWakeRuns(
	db: AppDb,
	githubUserId: string,
): Promise<number> {
	const rows = await db
		.select({ value: count() })
		.from(wakeRuns)
		.where(legacyWakeWhere(githubUserId));
	return countedNumber(rows);
}

async function readHomeRepo(
	db: AppDb,
	githubUserId: string,
): Promise<ParseResult<RepoRef | undefined>> {
	const rows = await db
		.select({
			repoId: homeRepos.repoId,
			repoName: homeRepos.repoName,
			repoOwner: homeRepos.repoOwner,
		})
		.from(homeRepos)
		.where(eq(homeRepos.githubUserId, githubUserId))
		.limit(1);
	const homeRow = firstRow(rows);
	if (homeRow === undefined) {
		return { kind: "ok", value: undefined };
	}
	const selected = parseSelect(
		homeRepoRefSelect,
		homeRow,
		"home repo row is invalid",
	);
	if (selected.kind === "invalid") {
		return selected;
	}
	return parseRepoDbRow(selected.value);
}

async function loadDeletionCounts(db: AppDb, githubUserId: string) {
	const vaultAccountsQuery = db
		.select({ value: count() })
		.from(vaultAccounts)
		.where(eq(vaultAccounts.githubUserId, githubUserId));
	const modelSlotsQuery = db
		.select({ value: count() })
		.from(modelSlots)
		.where(eq(modelSlots.githubUserId, githubUserId));
	const enabledReposQuery = db
		.select({ value: count() })
		.from(enabledRepos)
		.where(eq(enabledRepos.githubUserId, githubUserId));
	const repoRoutesQuery = db
		.select({ value: count() })
		.from(repoRoutes)
		.where(eq(repoRoutes.githubUserId, githubUserId));
	const wakeOwnedQuery = db
		.select({ value: count() })
		.from(wakeRuns)
		.where(eq(wakeRuns.githubUserId, githubUserId));
	return Promise.all([
		counted(vaultAccountsQuery),
		counted(modelSlotsQuery),
		counted(enabledReposQuery),
		counted(repoRoutesQuery),
		counted(wakeOwnedQuery),
		countLegacyWakeRuns(db, githubUserId),
		readHomeRepo(db, githubUserId),
	]);
}

async function previewAccountDeletion(
	db: AppDb,
	githubUserId: string,
): Promise<ParseResult<AccountDeletionPreview>> {
	try {
		const [
			vaultAccountCount,
			modelSlotCount,
			enabledRepoCount,
			repoClaimCount,
			wakeOwned,
			wakeLegacy,
			homeRepo,
		] = await loadDeletionCounts(db, githubUserId);
		if (homeRepo.kind === "invalid") {
			return homeRepo;
		}
		return {
			kind: "ok",
			value: {
				enabledRepoCount,
				homeRepo: homeRepo.value,
				modelSlotCount,
				repoClaimCount,
				vaultAccountCount,
				wakeRunCount: wakeOwned + wakeLegacy,
			},
		};
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function deleteAccount(
	db: AppDb,
	githubUserId: string,
): Promise<ParseResult<void>> {
	try {
		await db.batch([
			db.delete(wakeRuns).where(eq(wakeRuns.githubUserId, githubUserId)),
			db.delete(wakeRuns).where(legacyWakeWhere(githubUserId)),
			db.delete(repoRoutes).where(eq(repoRoutes.githubUserId, githubUserId)),
			db
				.delete(enabledRepos)
				.where(eq(enabledRepos.githubUserId, githubUserId)),
			db
				.delete(repoModelListMeta)
				.where(eq(repoModelListMeta.githubUserId, githubUserId)),
			db
				.delete(vaultAccounts)
				.where(eq(vaultAccounts.githubUserId, githubUserId)),
			db
				.delete(repoSettingDefaults)
				.where(eq(repoSettingDefaults.githubUserId, githubUserId)),
			db.delete(homeRepos).where(eq(homeRepos.githubUserId, githubUserId)),
			db
				.delete(encryptionKeyMeta)
				.where(eq(encryptionKeyMeta.githubUserId, githubUserId)),
		]);
		return { kind: "ok", value: undefined };
	} catch (error: unknown) {
		return storeError(error);
	}
}

export function createAccountDeletionStore(db: AppDb): AccountDeletionStore {
	return {
		deleteAccount: async (args) => deleteAccount(db, args.githubUserId),
		previewAccountDeletion: async (args) =>
			previewAccountDeletion(db, args.githubUserId),
	};
}
