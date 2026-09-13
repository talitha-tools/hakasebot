import { asc, count, eq } from "drizzle-orm";

import type { AppDb } from "#/db/client.ts";
import { countedNumber, firstRow } from "#/db/row.ts";
import {
	enabledRepos,
	encryptionKeyMeta,
	modelSlots,
	repoModelListMeta,
	vaultAccounts,
} from "#/db/schema.ts";
import {
	enabledRepoRefSelect,
	parseSelect,
	vaultEpochSelect,
} from "#/db/zod.ts";
import type { ParseResult, RepoRef } from "#/domain.ts";

import { parseRepoDbRow, storeError } from "./rows.ts";
import type { RotateVaultPreview, VaultStore } from "./types.ts";

async function readVaultEpoch(
	db: AppDb,
	args: { githubUserId: string },
): Promise<ParseResult<number | undefined>> {
	try {
		const rows = await db
			.select({ epoch: encryptionKeyMeta.epoch })
			.from(encryptionKeyMeta)
			.where(eq(encryptionKeyMeta.githubUserId, args.githubUserId))
			.limit(1);
		const row = firstRow(rows);
		if (row === undefined) {
			return { kind: "ok", value: undefined };
		}
		const selected = parseSelect(
			vaultEpochSelect,
			row,
			"encryption key meta row is invalid",
		);
		if (selected.kind === "invalid") {
			return selected;
		}
		return { kind: "ok", value: selected.value.epoch };
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function rotatePreviewRows(db: AppDb, githubUserId: string) {
	const accountsQuery = db
		.select({ value: count() })
		.from(vaultAccounts)
		.where(eq(vaultAccounts.githubUserId, githubUserId));
	const slotsQuery = db
		.select({ value: count() })
		.from(modelSlots)
		.where(eq(modelSlots.githubUserId, githubUserId));
	const overridesQuery = db
		.select({ value: count() })
		.from(repoModelListMeta)
		.where(eq(repoModelListMeta.githubUserId, githubUserId));
	const enabledQuery = db
		.select({ value: count() })
		.from(enabledRepos)
		.where(eq(enabledRepos.githubUserId, githubUserId));
	const reposQuery = db
		.select({
			repoId: enabledRepos.repoId,
			repoName: enabledRepos.repoName,
			repoOwner: enabledRepos.repoOwner,
		})
		.from(enabledRepos)
		.where(eq(enabledRepos.githubUserId, githubUserId))
		.orderBy(asc(enabledRepos.repoOwner), asc(enabledRepos.repoName));
	return Promise.all([
		accountsQuery,
		slotsQuery,
		overridesQuery,
		enabledQuery,
		reposQuery,
	]);
}

async function previewRotateVault(
	db: AppDb,
	args: { githubUserId: string },
): Promise<ParseResult<RotateVaultPreview>> {
	try {
		const [accountCount, slotCount, overrideCount, enabledRepoCount, repoRows] =
			await rotatePreviewRows(db, args.githubUserId);
		const repos: RepoRef[] = [];
		for (const row of repoRows) {
			const selected = parseSelect(
				enabledRepoRefSelect,
				row,
				"enabled repo row is invalid",
			);
			if (selected.kind === "invalid") {
				return selected;
			}
			const repo = parseRepoDbRow(selected.value);
			if (repo.kind === "invalid") {
				return repo;
			}
			repos.push(repo.value);
		}
		return {
			kind: "ok",
			value: {
				accountCount: countedNumber(accountCount),
				enabledRepoCount: countedNumber(enabledRepoCount),
				overrideCount: countedNumber(overrideCount),
				repos,
				slotCount: countedNumber(slotCount),
			},
		};
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function rotateVault(
	db: AppDb,
	args: { githubUserId: string },
): Promise<ParseResult<{ epoch: number }>> {
	try {
		const now = Date.now();
		const currentEpoch = await readVaultEpoch(db, {
			githubUserId: args.githubUserId,
		});
		if (currentEpoch.kind === "invalid") {
			return currentEpoch;
		}
		const nextEpoch = (currentEpoch.value ?? 1) + 1;
		await db.batch([
			db
				.delete(vaultAccounts)
				.where(eq(vaultAccounts.githubUserId, args.githubUserId)),
			db
				.delete(repoModelListMeta)
				.where(eq(repoModelListMeta.githubUserId, args.githubUserId)),
			db
				.insert(encryptionKeyMeta)
				.values({
					epoch: nextEpoch,
					githubUserId: args.githubUserId,
					rotatedAt: now,
				})
				.onConflictDoUpdate({
					set: { epoch: nextEpoch, rotatedAt: now },
					target: encryptionKeyMeta.githubUserId,
				}),
		]);
		return { kind: "ok", value: { epoch: nextEpoch } };
	} catch (error: unknown) {
		return storeError(error);
	}
}

type VaultRotationStore = Pick<
	VaultStore,
	"previewRotateVault" | "readVaultEpoch" | "rotateVault"
>;

export function createVaultRotationStore(db: AppDb): VaultRotationStore {
	return {
		previewRotateVault: async (args) => previewRotateVault(db, args),
		readVaultEpoch: async (args) => readVaultEpoch(db, args),
		rotateVault: async (args) => rotateVault(db, args),
	};
}
