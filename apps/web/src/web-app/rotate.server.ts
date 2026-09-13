import type { ParseResult, RepoId, RepoRef } from "@hakasebot/core/domain.ts";
import { repoId } from "@hakasebot/core/domain.ts";
import type {
	RotateVaultPreview,
	VaultStore,
} from "@hakasebot/core/vault/store.ts";

import { m as msg } from "#/paraglide/messages.js";

import type { UserSessionDeps } from "./accounts.server.ts";
import { userGithubUserId, vaultStoreOrInvalid } from "./accounts.server.ts";

export function parseConfirmRotateInput(input: {
	repos: string[];
}): ParseResult<readonly RepoId[]> {
	const repos: RepoId[] = [];
	for (const raw of input.repos) {
		const parsed = repoId(raw);
		if (parsed.kind === "invalid") {
			return parsed;
		}
		repos.push(parsed.value);
	}
	return { kind: "ok", value: repos };
}

function repoListMatches(
	expected: readonly RepoId[],
	actual: readonly RepoRef[],
): boolean {
	if (expected.length !== actual.length) {
		return false;
	}
	const expectedKeys = expected.toSorted();
	const actualKeys = actual.map((repo) => repo.id).toSorted();
	return expectedKeys.every((key, index) => key === actualKeys[index]);
}

async function storeForUser(
	args: UserSessionDeps & { store?: VaultStore },
): Promise<ParseResult<VaultStore>> {
	if (args.store !== undefined) {
		return { kind: "ok", value: args.store };
	}
	return vaultStoreOrInvalid();
}

export async function previewRotate(
	args: UserSessionDeps & { store?: VaultStore },
): Promise<ParseResult<RotateVaultPreview>> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store = await storeForUser(args);
	if (store.kind === "invalid") {
		return store;
	}
	return store.value.previewRotateVault({
		githubUserId: githubUserId.value,
	});
}

export async function confirmRotate(
	args: UserSessionDeps & {
		repos: readonly RepoId[];
		store?: VaultStore;
	},
): Promise<ParseResult<void>> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store = await storeForUser(args);
	if (store.kind === "invalid") {
		return store;
	}
	const preview = await store.value.previewRotateVault({
		githubUserId: githubUserId.value,
	});
	if (preview.kind === "invalid") {
		return preview;
	}
	if (!repoListMatches(args.repos, preview.value.repos)) {
		return {
			kind: "invalid",
			message: msg.rotate_repos_changed(),
		};
	}
	return { kind: "ok", value: undefined };
}

export async function rotateVault(
	args: UserSessionDeps & {
		repos: readonly RepoId[];
		store?: VaultStore;
	},
): Promise<ParseResult<{ epoch: number }>> {
	const confirmed = await confirmRotate(args);
	if (confirmed.kind === "invalid") {
		return confirmed;
	}
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store = await storeForUser(args);
	if (store.kind === "invalid") {
		return store;
	}
	return store.value.rotateVault({ githubUserId: githubUserId.value });
}
