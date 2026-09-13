import type { ParseResult, RepoId } from "@hakasebot/core/domain.ts";
import type { VaultStore } from "@hakasebot/core/vault/store.ts";
import type {
	AutoAuthors,
	AutoBranches,
	AutoReviewCadence,
	RepoSettingDefaults,
	WakeMode,
} from "@hakasebot/core/wake/domain.ts";

import type { UserSessionDeps } from "./accounts.server.ts";
import type { EnabledRepo } from "./domain.ts";
import { updateEnabledRepo, userAndStore } from "./repos-context.server.ts";

export async function setRepoWakeMode(
	args: UserSessionDeps & {
		repoId: RepoId;
		store?: VaultStore;
		wakeMode: WakeMode;
	},
): Promise<ParseResult<EnabledRepo>> {
	return updateEnabledRepo(args, async (ctx) =>
		ctx.store.setRepoWakeMode({
			githubUserId: ctx.githubUserId,
			repo: ctx.repo,
			wakeMode: args.wakeMode,
		}),
	);
}

export async function setRepoAutoAuthors(
	args: UserSessionDeps & {
		autoAuthors: AutoAuthors;
		repoId: RepoId;
		store?: VaultStore;
	},
): Promise<ParseResult<EnabledRepo>> {
	return updateEnabledRepo(args, async (ctx) =>
		ctx.store.setRepoAutoAuthors({
			autoAuthors: args.autoAuthors,
			githubUserId: ctx.githubUserId,
			repo: ctx.repo,
		}),
	);
}

export async function setRepoAutoBranches(
	args: UserSessionDeps & {
		autoBranches: AutoBranches;
		repoId: RepoId;
		store?: VaultStore;
	},
): Promise<ParseResult<EnabledRepo>> {
	return updateEnabledRepo(args, async (ctx) =>
		ctx.store.setRepoAutoBranches({
			autoBranches: args.autoBranches,
			githubUserId: ctx.githubUserId,
			repo: ctx.repo,
		}),
	);
}

export async function setRepoAutoReviewCadence(
	args: UserSessionDeps & {
		autoReviewCadence: AutoReviewCadence;
		repoId: RepoId;
		store?: VaultStore;
	},
): Promise<ParseResult<EnabledRepo>> {
	return updateEnabledRepo(args, async (ctx) =>
		ctx.store.setRepoAutoReviewCadence({
			autoReviewCadence: args.autoReviewCadence,
			githubUserId: ctx.githubUserId,
			repo: ctx.repo,
		}),
	);
}

export async function setRepoReviewInstructions(
	args: UserSessionDeps & {
		repoId: RepoId;
		prompt?: string;
		ignorePaths?: readonly string[];
		store?: VaultStore;
	},
): Promise<ParseResult<EnabledRepo>> {
	return updateEnabledRepo(args, async (ctx) =>
		ctx.store.setRepoReviewInstructions({
			githubUserId: ctx.githubUserId,
			repo: ctx.repo,
			...(args.prompt === undefined ? {} : { prompt: args.prompt }),
			...(args.ignorePaths === undefined
				? {}
				: { ignorePaths: args.ignorePaths }),
		}),
	);
}

export async function readVaultEpochForUser(
	args: UserSessionDeps & { store?: VaultStore },
): Promise<ParseResult<number>> {
	const user = await userAndStore(args);
	if (user.kind === "invalid") {
		return user;
	}
	const epoch = await user.value.store.readVaultEpoch({
		githubUserId: user.value.githubUserId,
	});
	if (epoch.kind === "invalid") {
		return epoch;
	}
	return {
		kind: "ok",
		value: epoch.value ?? 1,
	};
}

export async function getRepoSettingDefaults(
	args: UserSessionDeps & { store?: VaultStore },
): Promise<ParseResult<RepoSettingDefaults>> {
	const user = await userAndStore(args);
	if (user.kind === "invalid") {
		return user;
	}
	return user.value.store.getRepoSettingDefaults({
		githubUserId: user.value.githubUserId,
	});
}

export async function setRepoSettingDefaults(
	args: UserSessionDeps & {
		defaults: RepoSettingDefaults;
		store?: VaultStore;
	},
): Promise<ParseResult<RepoSettingDefaults>> {
	const user = await userAndStore(args);
	if (user.kind === "invalid") {
		return user;
	}
	return user.value.store.setRepoSettingDefaults({
		defaults: args.defaults,
		githubUserId: user.value.githubUserId,
	});
}
