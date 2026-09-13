import { d1Bindable } from "@hakasebot/core/d1.ts";
import type { AppDb } from "@hakasebot/core/db/client.ts";
import { firstRow } from "@hakasebot/core/db/row.ts";
import { homeRepos } from "@hakasebot/core/db/schema.ts";
import { homeRepoSelect, parseSelect } from "@hakasebot/core/db/zod.ts";
import type {
	GithubInstallationId,
	ParseResult,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import { githubAppInstallationId, repoRef } from "@hakasebot/core/domain.ts";
import { d1Present } from "@hakasebot/core/vault/store.ts";
import { eq } from "drizzle-orm";

import { m as msg } from "#/paraglide/messages.js";

import { storeError } from "./store-shared.ts";

export interface HomeRepoRow {
	createdAt: number;
	installationId: GithubInstallationId | undefined;
	repo: RepoRef;
	secretsEpoch: number;
	secretsSyncedAt: number | undefined;
}

function parseHomeRow(row: unknown): ParseResult<HomeRepoRow> {
	const selected = parseSelect(homeRepoSelect, row, "home repo row is invalid");
	if (selected.kind === "invalid") {
		return selected;
	}
	const {
		createdAt,
		installationId: installationIdRaw,
		repoId,
		repoName,
		repoOwner,
		secretsEpoch,
		secretsSyncedAt,
	} = selected.value;
	const repo = repoRef({
		id: repoId,
		name: repoName,
		owner: repoOwner,
	});
	if (repo.kind === "invalid") {
		return repo;
	}
	let installationId: GithubInstallationId | undefined;
	if (d1Present(installationIdRaw) && installationIdRaw !== "") {
		const parsed = githubAppInstallationId(installationIdRaw);
		if (parsed.kind === "invalid") {
			return parsed;
		}
		installationId = parsed.value;
	}
	return {
		kind: "ok",
		value: {
			createdAt,
			installationId,
			repo: repo.value,
			secretsEpoch,
			secretsSyncedAt: secretsSyncedAt ?? undefined,
		},
	};
}

export async function getHomeRepo(
	db: AppDb,
	githubUserId: string,
): Promise<ParseResult<HomeRepoRow | undefined>> {
	try {
		const rows = await db
			.select()
			.from(homeRepos)
			.where(eq(homeRepos.githubUserId, githubUserId))
			.limit(1);
		const row = firstRow(rows);
		if (row === undefined) {
			return { kind: "ok", value: undefined };
		}
		return parseHomeRow(row);
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function requireHomeRepo(
	db: AppDb,
	githubUserId: string,
	missingMessage: string,
): Promise<ParseResult<HomeRepoRow>> {
	const home = await getHomeRepo(db, githubUserId);
	if (home.kind === "invalid") {
		return home;
	}
	if (home.value === undefined) {
		return { kind: "invalid", message: missingMessage };
	}
	return { kind: "ok", value: home.value };
}

export async function clearInstallationIfMatches(
	db: AppDb,
	args: { installationId: GithubInstallationId },
): Promise<ParseResult<void>> {
	try {
		await db
			.update(homeRepos)
			.set({ installationId: d1Bindable(undefined) })
			.where(eq(homeRepos.installationId, args.installationId));
		return { kind: "ok", value: undefined };
	} catch (error: unknown) {
		return storeError(error);
	}
}

export async function markHomeSecretsSynced(
	db: AppDb,
	args: { epoch: number; githubUserId: string },
): Promise<ParseResult<HomeRepoRow>> {
	try {
		const now = Date.now();
		await db
			.update(homeRepos)
			.set({ secretsEpoch: args.epoch, secretsSyncedAt: now })
			.where(eq(homeRepos.githubUserId, args.githubUserId));
		return await requireHomeRepo(
			db,
			args.githubUserId,
			msg.home_repo_missing(),
		);
	} catch (error: unknown) {
		return storeError(error);
	}
}

export async function putHomeRepo(
	db: AppDb,
	args: {
		githubUserId: string;
		installationId: GithubInstallationId | undefined;
		now: number;
		repo: RepoRef;
	},
): Promise<ParseResult<HomeRepoRow>> {
	try {
		await db
			.insert(homeRepos)
			.values({
				createdAt: args.now,
				githubUserId: args.githubUserId,
				installationId: d1Bindable(args.installationId),
				repoId: args.repo.id,
				repoName: args.repo.name,
				repoOwner: args.repo.owner,
			})
			.onConflictDoUpdate({
				set: {
					installationId: d1Bindable(args.installationId),
					repoId: args.repo.id,
					repoName: args.repo.name,
					repoOwner: args.repo.owner,
				},
				target: homeRepos.githubUserId,
			});
		return await requireHomeRepo(
			db,
			args.githubUserId,
			msg.home_repo_missing_after_save(),
		);
	} catch (error: unknown) {
		return storeError(error);
	}
}
