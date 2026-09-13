/** Facade: repo lifecycle here; parsing, settings, and model-list modules re-exported. */
import { createAppDb } from "@hakasebot/core/db/client.ts";
import type {
	GithubUserToken,
	ParseResult,
	RepoId,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import { checkClaimHolderWriteAccess } from "@hakasebot/core/github-api.server.ts";
import type { VaultStore } from "@hakasebot/core/vault/store.ts";

import { createRouteStore } from "#/home/route-store.ts";
import { createHomeStore, d1FromWorkerEnv } from "#/home/store.ts";
import type { LastWake } from "#/home/store.ts";
import { completeHostedBotInstall } from "#/lab/hosted-bot.server.ts";
import { tokenFromUserSession } from "#/lib/user-session";
import { m as msg } from "#/paraglide/messages.js";

import type { UserSessionDeps } from "./accounts.server.ts";
import { userGithubUserId } from "./accounts.server.ts";
import type { EnabledRepo } from "./domain.ts";
import { takeRepoClaim } from "./reclaim-stale-claim.server.ts";
import {
	enablerWriteAccessFromSession,
	mapEnabledRepo,
	readSessionFromDeps,
	repoFromEnabled,
	userAndStore,
} from "./repos-context.server.ts";

export { fetchUserGithubToken } from "./repos-context.server.ts";
export {
	clearRepoModelList,
	listRepoModelSlots,
	setRepoModelList,
} from "./repo-model-list.server.ts";
export {
	getRepoSettingDefaults,
	readVaultEpochForUser,
	setRepoAutoAuthors,
	setRepoAutoBranches,
	setRepoAutoReviewCadence,
	setRepoReviewInstructions,
	setRepoSettingDefaults,
	setRepoWakeMode,
} from "./repo-settings.server.ts";
export {
	parseEnableRepoInput,
	parseRepoIdInput,
	parseSetRepoAutoAuthorsInput,
	parseSetRepoAutoBranchesInput,
	parseSetRepoAutoReviewCadenceInput,
	parseSetRepoModelListInput,
	parseSetRepoReviewInstructionsInput,
	parseSetRepoSettingDefaultsInput,
	parseSetRepoWakeModeInput,
} from "./repos-input.server.ts";

export async function listEnabledRepos(
	args: UserSessionDeps & { store?: VaultStore },
): Promise<ParseResult<EnabledRepo[]>> {
	const user = await userAndStore(args);
	if (user.kind === "invalid") {
		return user;
	}
	const listed = await user.value.store.listEnabledRepos({
		githubUserId: user.value.githubUserId,
	});
	if (listed.kind === "invalid") {
		return listed;
	}
	return {
		kind: "ok",
		value: listed.value.map(mapEnabledRepo),
	};
}

export async function listLastWakes(
	args: UserSessionDeps,
): Promise<ParseResult<Record<string, LastWake>>> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const db = await d1FromWorkerEnv();
	if (db === undefined) {
		return { kind: "ok", value: {} };
	}
	return createHomeStore(db).listLastWakes({
		githubUserId: githubUserId.value,
	});
}

async function claimRepoRoute(args: {
	githubUserId: string;
	repo: RepoRef;
	store: VaultStore;
	token: ParseResult<GithubUserToken>;
}): Promise<ParseResult<void>> {
	const db = await d1FromWorkerEnv();
	if (db === undefined) {
		return { kind: "invalid", message: msg.store_unbound() };
	}
	const { token } = args;
	const claimed = await takeRepoClaim({
		checkHolderAccess: async (holderGithubUserId) => {
			if (token.kind === "invalid") {
				return { kind: "unknown" };
			}
			return checkClaimHolderWriteAccess({
				holderGithubUserId,
				repo: args.repo,
				token: token.value,
			});
		},
		disableHolder: async (holderGithubUserId) =>
			args.store.disableRepo({
				githubUserId: holderGithubUserId,
				repo: args.repo,
			}),
		githubUserId: args.githubUserId,
		now: Date.now(),
		repo: args.repo,
		routes: createRouteStore(createAppDb(db)),
	});
	if (claimed.kind === "invalid") {
		return claimed;
	}
	return { kind: "ok", value: undefined };
}

export async function enableRepo(
	args: UserSessionDeps & {
		repo: RepoRef;
		store?: VaultStore;
	},
): Promise<ParseResult<EnabledRepo>> {
	const user = await userAndStore(args);
	if (user.kind === "invalid") {
		return user;
	}
	// Fail closed: only a user who can write the repo may enable/claim it. This
	// gate runs on every enable, independent of the D1/route-claim path below,
	// so a squatted route can never be created for a repo the user cannot write.
	// The session is resolved once here and its token reused for the claim.
	const session = await readSessionFromDeps(args);
	const access = await enablerWriteAccessFromSession({
		repo: args.repo,
		session,
	});
	if (access.kind === "invalid") {
		return access;
	}
	const claimed = await claimRepoRoute({
		githubUserId: user.value.githubUserId,
		repo: args.repo,
		store: user.value.store,
		token: tokenFromUserSession(session),
	});
	if (claimed.kind === "invalid") {
		return claimed;
	}
	const enabled = await user.value.store.enableRepo({
		githubUserId: user.value.githubUserId,
		repo: args.repo,
	});
	if (enabled.kind === "invalid") {
		return enabled;
	}
	return { kind: "ok", value: mapEnabledRepo(enabled.value) };
}

export async function disableRepo(
	args: UserSessionDeps & { repoId: RepoId; store?: VaultStore },
): Promise<ParseResult<void>> {
	const resolved = await repoFromEnabled(args);
	if (resolved.kind === "invalid") {
		return resolved;
	}
	const { githubUserId, repo, store } = resolved.value;
	const db = await d1FromWorkerEnv();
	if (db !== undefined) {
		const released = await createRouteStore(createAppDb(db)).releaseRoute({
			githubUserId,
			repo,
		});
		if (released.kind === "invalid") {
			return released;
		}
	}
	const disabled = await store.disableRepo({
		githubUserId,
		repo,
	});
	if (disabled.kind === "invalid") {
		return disabled;
	}
	return { kind: "ok", value: undefined };
}

export async function completeRepoBot(
	args: UserSessionDeps & { repoId: RepoId; store?: VaultStore },
): Promise<ParseResult<EnabledRepo>> {
	const resolved = await repoFromEnabled(args);
	if (resolved.kind === "invalid") {
		return resolved;
	}
	const { githubUserId, repo, store } = resolved.value;
	const completed = await completeHostedBotInstall({
		cookieHeader: args.cookieHeader,
		repo,
	});
	const db = await d1FromWorkerEnv();
	if (db !== undefined) {
		const routed = await createRouteStore(createAppDb(db)).setBotInstallation({
			installationId: completed.installationId,
			repo,
		});
		if (routed.kind === "invalid") {
			return routed;
		}
	}
	const marked = await store.markRepoBotAt({
		at: Date.now(),
		githubUserId,
		repo,
	});
	if (marked.kind === "invalid") {
		return marked;
	}
	return { kind: "ok", value: mapEnabledRepo(marked.value) };
}

export async function markRepoSynced(
	args: UserSessionDeps & {
		repoId: RepoId;
		epoch: number;
		store?: VaultStore;
	},
): Promise<ParseResult<EnabledRepo>> {
	const resolved = await repoFromEnabled(args);
	if (resolved.kind === "invalid") {
		return resolved;
	}
	const { githubUserId, repo, store } = resolved.value;
	const marked = await store.markRepoSynced({
		epoch: args.epoch,
		githubUserId,
		repo,
	});
	if (marked.kind === "invalid") {
		return marked;
	}
	await store.markHomeDispatcherAt({
		at: Date.now(),
		githubUserId,
		repo,
	});
	const db = await d1FromWorkerEnv();
	if (db !== undefined) {
		await createHomeStore(db).markHomeSecretsSynced({
			epoch: args.epoch,
			githubUserId,
		});
	}
	const after = await store.markRepoSynced({
		epoch: args.epoch,
		githubUserId,
		repo,
	});
	if (after.kind === "invalid") {
		return after;
	}
	return { kind: "ok", value: mapEnabledRepo(after.value) };
}
