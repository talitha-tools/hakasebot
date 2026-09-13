import type {
	GithubUserToken,
	ParseResult,
	RepoId,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import { fetchRepoWriteAccess } from "@hakasebot/core/github-api.server.ts";
import type {
	EnabledRepoRow,
	VaultStore,
} from "@hakasebot/core/vault/store.ts";

import type { UserSession } from "#/lib/user-session";
import { readUserSession, tokenFromUserSession } from "#/lib/user-session";
import { m as msg } from "#/paraglide/messages.js";

import type { UserSessionDeps } from "./accounts.server.ts";
import { userGithubUserId, vaultStoreOrInvalid } from "./accounts.server.ts";
import type { EnabledRepo } from "./domain.ts";

async function storeForUser(
	args: UserSessionDeps & { store?: VaultStore },
): Promise<ParseResult<VaultStore>> {
	if (args.store !== undefined) {
		return { kind: "ok", value: args.store };
	}
	return vaultStoreOrInvalid();
}

export async function userAndStore(
	args: UserSessionDeps & { store?: VaultStore },
): Promise<ParseResult<{ githubUserId: string; store: VaultStore }>> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store = await storeForUser(args);
	if (store.kind === "invalid") {
		return store;
	}
	return {
		kind: "ok",
		value: { githubUserId: githubUserId.value, store: store.value },
	};
}

async function resolveEnabledRepo(args: {
	githubUserId: string;
	repoId: RepoId;
	store: VaultStore;
}): Promise<ParseResult<RepoRef>> {
	const listed = await args.store.listEnabledRepos({
		githubUserId: args.githubUserId,
	});
	if (listed.kind === "invalid") {
		return listed;
	}
	const row = listed.value.find((item) => item.repo.id === args.repoId);
	if (row === undefined) {
		return { kind: "invalid", message: msg.repos_enabled_missing() };
	}
	return { kind: "ok", value: row.repo };
}

export interface EnabledRepoContext {
	githubUserId: string;
	repo: RepoRef;
	store: VaultStore;
}

export async function repoFromEnabled(
	args: UserSessionDeps & { repoId: RepoId; store?: VaultStore },
): Promise<ParseResult<EnabledRepoContext>> {
	const user = await userAndStore(args);
	if (user.kind === "invalid") {
		return user;
	}
	const repo = await resolveEnabledRepo({
		githubUserId: user.value.githubUserId,
		repoId: args.repoId,
		store: user.value.store,
	});
	if (repo.kind === "invalid") {
		return repo;
	}
	return {
		kind: "ok",
		value: {
			githubUserId: user.value.githubUserId,
			repo: repo.value,
			store: user.value.store,
		},
	};
}

export function mapEnabledRepo(row: EnabledRepoRow): EnabledRepo {
	return {
		autoAuthors: row.autoAuthors,
		autoBranches: row.autoBranches,
		autoReviewCadence: row.autoReviewCadence,
		homeAt: row.homeAt,
		lastSyncedAt: row.lastSyncedAt,
		botAt: row.botAt,
		repo: row.repo,
		syncedEpoch: row.syncedEpoch,
		wakeMode: row.wakeMode,
		...(row.prompt === undefined ? {} : { prompt: row.prompt }),
		...(row.ignorePaths === undefined ? {} : { ignorePaths: row.ignorePaths }),
	};
}

/** Resolves the enabled repo, applies the update, and maps the row for the UI. */
export async function updateEnabledRepo(
	args: UserSessionDeps & { repoId: RepoId; store?: VaultStore },
	update: (ctx: EnabledRepoContext) => Promise<ParseResult<EnabledRepoRow>>,
): Promise<ParseResult<EnabledRepo>> {
	const resolved = await repoFromEnabled(args);
	if (resolved.kind === "invalid") {
		return resolved;
	}
	const updated = await update(resolved.value);
	if (updated.kind === "invalid") {
		return updated;
	}
	return { kind: "ok", value: mapEnabledRepo(updated.value) };
}

export async function readSessionFromDeps(
	args: UserSessionDeps,
): Promise<UserSession> {
	return readUserSession({
		cookieHeader: args.cookieHeader,
		...(args.getAccessToken === undefined
			? {}
			: { getAccessToken: args.getAccessToken }),
	});
}

export async function fetchUserGithubToken(
	args: UserSessionDeps,
): Promise<ParseResult<GithubUserToken>> {
	return tokenFromUserSession(await readSessionFromDeps(args));
}

type WriteAccessCheck = (args: {
	repo: RepoRef;
	token: GithubUserToken;
}) => Promise<ParseResult<undefined>>;

/**
 * Decide whether the signed-in user may enable/claim `repo`. Fails closed: a
 * real OAuth session must present a usable token AND hold push/admin on the
 * repo. Production identity is resolved from that token, so the only token-less
 * session that reaches enable is the loopback dev user, allowed here because it
 * has no real repo to check. A GitHub API error is a rejection, not a pass, so
 * a transient outage cannot open the gate.
 */
export async function enablerWriteAccessFromSession(args: {
	repo: RepoRef;
	session: UserSession;
	fetchWriteAccess?: WriteAccessCheck;
}): Promise<ParseResult<void>> {
	const token = tokenFromUserSession(args.session);
	if (args.session.kind === "dev" && token.kind === "invalid") {
		return { kind: "ok", value: undefined };
	}
	if (token.kind === "invalid") {
		return token;
	}
	const check = args.fetchWriteAccess ?? fetchRepoWriteAccess;
	return check({ repo: args.repo, token: token.value });
}
