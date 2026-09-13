import { and, asc, count, eq } from "drizzle-orm";

import type { AppDb } from "#/db/client.ts";
import { countedNumber, firstRow } from "#/db/row.ts";
import { vaultAccounts } from "#/db/schema.ts";
import { parseSelect, vaultSealedSelect } from "#/db/zod.ts";
import type { ParseResult } from "#/domain.ts";
import { accountId } from "#/vault/domain.ts";
import type {
	AccountId,
	SealedCredential,
	VaultAccountMeta,
	VaultAccountRow,
} from "#/vault/domain.ts";

import {
	parseAccountMetaRow,
	parseAccountRow,
	parseSealedCredential,
	storeError,
} from "./rows.ts";
import type { SaveVaultAccountArgs, VaultStore } from "./types.ts";

async function countAccounts(
	db: AppDb,
	args: { githubUserId: string },
): Promise<ParseResult<number>> {
	try {
		const rows = await db
			.select({ value: count() })
			.from(vaultAccounts)
			.where(eq(vaultAccounts.githubUserId, args.githubUserId));
		return {
			kind: "ok",
			value: countedNumber(rows),
		};
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function getFirstSealedAccount(
	db: AppDb,
	args: { githubUserId: string },
): Promise<ParseResult<SealedCredential | undefined>> {
	try {
		const rows = await db
			.select({
				ciphertext: vaultAccounts.ciphertext,
				id: vaultAccounts.id,
				iv: vaultAccounts.iv,
			})
			.from(vaultAccounts)
			.where(eq(vaultAccounts.githubUserId, args.githubUserId))
			.orderBy(asc(vaultAccounts.createdAt))
			.limit(1);
		const row = firstRow(rows);
		if (row === undefined) {
			return { kind: "ok", value: undefined };
		}
		const selected = parseSelect(
			vaultSealedSelect,
			row,
			"sealed account row is incomplete",
		);
		if (selected.kind === "invalid") {
			return selected;
		}
		const sealed = parseSealedCredential(selected.value);
		if (sealed.kind === "invalid") {
			return sealed;
		}
		return { kind: "ok", value: sealed.value };
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function listAccounts(
	db: AppDb,
	args: { githubUserId: string },
): Promise<ParseResult<VaultAccountMeta[]>> {
	try {
		const rows = await db
			.select({
				createdAt: vaultAccounts.createdAt,
				engine: vaultAccounts.engine,
				id: vaultAccounts.id,
				label: vaultAccounts.label,
			})
			.from(vaultAccounts)
			.where(eq(vaultAccounts.githubUserId, args.githubUserId))
			.orderBy(asc(vaultAccounts.createdAt));
		const accounts: VaultAccountMeta[] = [];
		for (const row of rows) {
			const parsed = parseAccountMetaRow(row);
			if (parsed.kind === "invalid") {
				return parsed;
			}
			accounts.push(parsed.value);
		}
		return { kind: "ok", value: accounts };
	} catch (error: unknown) {
		return storeError(error);
	}
}

export async function getVaultAccount(
	db: AppDb,
	args: { githubUserId: string; id: AccountId },
): Promise<ParseResult<VaultAccountRow>> {
	try {
		const id = accountId(args.id);
		if (id.kind === "invalid") {
			return id;
		}
		const rows = await db
			.select()
			.from(vaultAccounts)
			.where(
				and(
					eq(vaultAccounts.githubUserId, args.githubUserId),
					eq(vaultAccounts.id, id.value),
				),
			)
			.limit(1);
		const row = firstRow(rows);
		if (row === undefined) {
			return { kind: "invalid", message: "vault account not found" };
		}
		return parseAccountRow(row);
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function saveAccount(
	db: AppDb,
	args: SaveVaultAccountArgs,
): Promise<ParseResult<VaultAccountMeta>> {
	try {
		const id = accountId(args.sealed.accountId);
		if (id.kind === "invalid") {
			return id;
		}
		if (args.sealed.ciphertext.length === 0 || args.sealed.iv.length === 0) {
			return {
				kind: "invalid",
				message: "sealed credential is incomplete",
			};
		}
		const label = args.label.trim();
		if (label.length === 0) {
			return { kind: "invalid", message: "account label is empty" };
		}
		const now = Date.now();
		await db.insert(vaultAccounts).values({
			ciphertext: args.sealed.ciphertext,
			createdAt: now,
			engine: args.engine,
			githubUserId: args.githubUserId,
			id: id.value,
			iv: args.sealed.iv,
			label,
			updatedAt: now,
		});
		return {
			kind: "ok",
			value: {
				createdAt: now,
				engine: args.engine,
				id: id.value,
				label,
			},
		};
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function deleteAccount(
	db: AppDb,
	args: { githubUserId: string; id: AccountId },
): Promise<ParseResult<void>> {
	try {
		const id = accountId(args.id);
		if (id.kind === "invalid") {
			return id;
		}
		await db
			.delete(vaultAccounts)
			.where(
				and(
					eq(vaultAccounts.githubUserId, args.githubUserId),
					eq(vaultAccounts.id, id.value),
				),
			);
		return { kind: "ok", value: undefined };
	} catch (error: unknown) {
		return storeError(error);
	}
}

type VaultAccountStore = Pick<
	VaultStore,
	| "countAccounts"
	| "deleteAccount"
	| "getAccount"
	| "getFirstSealedAccount"
	| "listAccounts"
	| "saveAccount"
>;

export function createVaultAccountStore(db: AppDb): VaultAccountStore {
	return {
		countAccounts: async (args) => countAccounts(db, args),
		deleteAccount: async (args) => deleteAccount(db, args),
		getAccount: async (args) => getVaultAccount(db, args),
		getFirstSealedAccount: async (args) => getFirstSealedAccount(db, args),
		listAccounts: async (args) => listAccounts(db, args),
		saveAccount: async (args) => saveAccount(db, args),
	};
}
