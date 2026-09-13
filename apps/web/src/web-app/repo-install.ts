import type {
	GithubUserToken,
	ParseResult,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import type { EncryptionKey } from "@hakasebot/core/vault/domain.ts";
import { buildRepoSyncPayload } from "@hakasebot/core/vault/store.ts";
import { createClientOnlyFn } from "@tanstack/react-start";

import { markHomeSyncedFn, readHomeRepoFn } from "#/home/home-rpc.ts";
import { m as msg } from "#/paraglide/messages.js";
import { syncVaultSecretsFromBrowser as syncVaultSecretsFromBrowserImpl } from "#/vault/github-secrets.client.ts";
import { loadEncryptionKey as loadEncryptionKeyImpl } from "#/vault/session-key.client.ts";

import {
	completeRepoBotFn,
	fetchUserGithubTokenFn,
	markRepoSyncedFn,
	readVaultEpochFn,
} from "./repos-rpc.ts";

const syncVaultSecretsFromBrowser = createClientOnlyFn(
	async (args: {
		githubToken: GithubUserToken;
		repo: RepoRef;
		secrets: { encryptionKey: EncryptionKey };
	}) => syncVaultSecretsFromBrowserImpl(args),
);

const loadEncryptionKey = createClientOnlyFn(loadEncryptionKeyImpl);

export async function completeBot(args: { repo: RepoRef }): Promise<void> {
	await completeRepoBotFn({
		data: { repo: args.repo.id },
	});
}

export async function pushRepoVaultSecrets(args: {
	home: RepoRef;
	repo: RepoRef;
	encryptionKey: EncryptionKey;
}): Promise<ParseResult<readonly string[]>> {
	const tokenResult = await fetchUserGithubTokenFn();
	const payload = buildRepoSyncPayload({
		encryptionKey: args.encryptionKey,
	});
	const synced = await syncVaultSecretsFromBrowser({
		githubToken: tokenResult.token,
		repo: args.home,
		secrets: payload,
	});
	if (synced.kind === "invalid") {
		return synced;
	}
	const epochResult = await readVaultEpochFn();
	await markRepoSyncedFn({
		data: {
			epoch: epochResult.epoch,
			repo: args.repo.id,
		},
	});
	return synced;
}

export async function pushHomeVaultSecretsFromBrowser(args: {
	githubUserId: string;
}): Promise<ParseResult<readonly string[]>> {
	const encryptionKey = loadEncryptionKey(args.githubUserId);
	if (encryptionKey === undefined) {
		return {
			kind: "invalid",
			message: msg.accounts_key_missing(),
		};
	}
	const home = await readHomeRepoFn();
	if (home === undefined) {
		return {
			kind: "invalid",
			message: msg.house_make_first(),
		};
	}
	const tokenResult = await fetchUserGithubTokenFn();
	const payload = buildRepoSyncPayload({
		encryptionKey,
	});
	const synced = await syncVaultSecretsFromBrowser({
		githubToken: tokenResult.token,
		repo: home.repo,
		secrets: payload,
	});
	if (synced.kind === "invalid") {
		return synced;
	}
	const epochResult = await readVaultEpochFn();
	await markHomeSyncedFn({ data: { epoch: epochResult.epoch } });
	return synced;
}

export async function pushRepoVaultSecretsFromBrowser(args: {
	githubUserId: string;
	repo: RepoRef;
}): Promise<ParseResult<readonly string[]>> {
	const encryptionKey = loadEncryptionKey(args.githubUserId);
	if (encryptionKey === undefined) {
		return {
			kind: "invalid",
			message: msg.accounts_key_missing(),
		};
	}
	const home = await readHomeRepoFn();
	if (home === undefined) {
		return {
			kind: "invalid",
			message: msg.house_make_settings_first(),
		};
	}
	return pushRepoVaultSecrets({
		home: home.repo,
		repo: args.repo,
		encryptionKey,
	});
}
