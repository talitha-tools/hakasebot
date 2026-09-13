import { and, eq } from "drizzle-orm";

import { d1Bindable } from "#/d1.ts";
import type { AppDb } from "#/db/client.ts";
import { enabledRepos } from "#/db/schema.ts";
import type { ParseResult } from "#/domain.ts";
import type { WakeMode } from "#/wake/domain.ts";

import { readEnabledRepoRow } from "./enabled-repos.ts";
import { jsonOrNull, storeError } from "./rows.ts";
import type {
	EnabledRepoRow,
	SetRepoAutoAuthorsArgs,
	SetRepoAutoBranchesArgs,
	SetRepoAutoReviewCadenceArgs,
	SetRepoReviewInstructionsArgs,
	VaultStore,
} from "./types.ts";

async function setRepoReviewInstructions(
	db: AppDb,
	args: SetRepoReviewInstructionsArgs,
): Promise<ParseResult<EnabledRepoRow>> {
	try {
		const prompt = args.prompt?.trim();
		const ignorePaths =
			args.ignorePaths
				?.map((item) => item.trim())
				.filter((item) => item.length > 0) ?? [];
		await db
			.update(enabledRepos)
			.set({
				ignorePaths: jsonOrNull(ignorePaths),
				reviewPrompt: d1Bindable(
					prompt === undefined || prompt.length === 0 ? undefined : prompt,
				),
			})
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

async function setRepoWakeMode(
	db: AppDb,
	args: {
		githubUserId: string;
		repo: EnabledRepoRow["repo"];
		wakeMode: WakeMode;
	},
): Promise<ParseResult<EnabledRepoRow>> {
	try {
		await db
			.update(enabledRepos)
			.set({ wakeMode: args.wakeMode })
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

async function setRepoAutoAuthors(
	db: AppDb,
	args: SetRepoAutoAuthorsArgs,
): Promise<ParseResult<EnabledRepoRow>> {
	try {
		await db
			.update(enabledRepos)
			.set({
				autoAuthorSkip: jsonOrNull(args.autoAuthors.skipLogins),
				autoAuthors: args.autoAuthors.scope,
			})
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

async function setRepoAutoBranches(
	db: AppDb,
	args: SetRepoAutoBranchesArgs,
): Promise<ParseResult<EnabledRepoRow>> {
	try {
		await db
			.update(enabledRepos)
			.set({
				autoBranchList: jsonOrNull(args.autoBranches.branches),
				autoBranchSkip: jsonOrNull(args.autoBranches.skipBranches),
				autoBranches: args.autoBranches.scope,
			})
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

async function setRepoAutoReviewCadence(
	db: AppDb,
	args: SetRepoAutoReviewCadenceArgs,
): Promise<ParseResult<EnabledRepoRow>> {
	try {
		await db
			.update(enabledRepos)
			.set({ autoReviewCadence: args.autoReviewCadence })
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

type RepoSettingsStore = Pick<
	VaultStore,
	| "setRepoAutoAuthors"
	| "setRepoAutoBranches"
	| "setRepoAutoReviewCadence"
	| "setRepoReviewInstructions"
	| "setRepoWakeMode"
>;

export function createRepoSettingsStore(db: AppDb): RepoSettingsStore {
	return {
		setRepoAutoAuthors: async (args) => setRepoAutoAuthors(db, args),
		setRepoAutoBranches: async (args) => setRepoAutoBranches(db, args),
		setRepoAutoReviewCadence: async (args) =>
			setRepoAutoReviewCadence(db, args),
		setRepoReviewInstructions: async (args) =>
			setRepoReviewInstructions(db, args),
		setRepoWakeMode: async (args) => setRepoWakeMode(db, args),
	};
}
