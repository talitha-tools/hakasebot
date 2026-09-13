import { brandString, engineKind } from "@hakasebot/core/domain.ts";
import type { EngineKind, ParseResult } from "@hakasebot/core/domain.ts";
import type {
	AccountId,
	SealedCredential,
	VaultAccountMeta,
} from "@hakasebot/core/vault/domain.ts";
import { accountId } from "@hakasebot/core/vault/domain.ts";
import type { VaultStore } from "@hakasebot/core/vault/store.ts";

import type { AccessTokenFetcher } from "#/lib/github-session";
import type { GithubUserFetcher } from "#/lib/user-session";
import { m as msg } from "#/paraglide/messages.js";
import {
	readVaultGateSnapshot,
	readVaultStoreOrInvalid,
} from "#/vault/gate.server.ts";

export interface SaveSealedAccountInput {
	engine: EngineKind;
	label: string;
	sealed: SealedCredential;
}

export function parseSaveSealedAccountInput(input: {
	engine: string;
	label: string;
	sealed: {
		accountId: string;
		ciphertext: string;
		iv: string;
	};
}): ParseResult<SaveSealedAccountInput> {
	const engine = engineKind(input.engine);
	if (engine.kind === "invalid") {
		return engine;
	}
	const id = accountId(input.sealed.accountId);
	if (id.kind === "invalid") {
		return id;
	}
	if (input.sealed.ciphertext.length === 0 || input.sealed.iv.length === 0) {
		return {
			kind: "invalid",
			message: msg.accounts_sealed_incomplete(),
		};
	}
	const label = input.label.trim();
	if (label.length === 0) {
		return { kind: "invalid", message: msg.accounts_label_empty() };
	}
	return {
		kind: "ok",
		value: {
			engine: engine.value,
			label,
			sealed: {
				accountId: id.value,
				ciphertext: brandString(input.sealed.ciphertext, "Ciphertext"),
				iv: brandString(input.sealed.iv, "Iv"),
			},
		},
	};
}

export function parseDeleteAccountInput(input: {
	id: string;
}): ParseResult<AccountId> {
	return accountId(input.id);
}

export interface UserSessionDeps {
	cookieHeader: string;
	fetchGithubUser?: GithubUserFetcher;
	getAccessToken?: AccessTokenFetcher;
	store?: Pick<
		VaultStore,
		"countAccounts" | "getFirstSealedAccount" | "readVaultEpoch"
	>;
}

export async function userGithubUserId(
	args: UserSessionDeps,
): Promise<ParseResult<string>> {
	const gate = await readVaultGateSnapshot({
		cookieHeader: args.cookieHeader,
		...(args.fetchGithubUser === undefined
			? {}
			: { fetchGithubUser: args.fetchGithubUser }),
		...(args.getAccessToken === undefined
			? {}
			: { getAccessToken: args.getAccessToken }),
		...(args.store === undefined ? {} : { store: args.store }),
	});
	if (gate.kind === "invalid") {
		return gate;
	}
	return { kind: "ok", value: gate.value.githubUserId };
}

export async function vaultStoreOrInvalid(): Promise<ParseResult<VaultStore>> {
	return readVaultStoreOrInvalid();
}

export async function listVaultAccounts(
	args: UserSessionDeps & { store?: VaultStore },
): Promise<ParseResult<VaultAccountMeta[]>> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store =
		args.store === undefined
			? await vaultStoreOrInvalid()
			: { kind: "ok" as const, value: args.store };
	if (store.kind === "invalid") {
		return store;
	}
	return store.value.listAccounts({
		githubUserId: githubUserId.value,
	});
}

export async function saveVaultAccount(
	args: UserSessionDeps & {
		input: SaveSealedAccountInput;
		store?: VaultStore;
	},
): Promise<ParseResult<VaultAccountMeta>> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store =
		args.store === undefined
			? await vaultStoreOrInvalid()
			: { kind: "ok" as const, value: args.store };
	if (store.kind === "invalid") {
		return store;
	}
	const saved = await store.value.saveAccount({
		engine: args.input.engine,
		githubUserId: githubUserId.value,
		label: args.input.label,
		sealed: args.input.sealed,
	});
	if (saved.kind === "invalid") {
		return saved;
	}
	return saved;
}

export async function deleteVaultAccount(
	args: UserSessionDeps & {
		id: AccountId;
		store?: VaultStore;
	},
): Promise<ParseResult<void>> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store =
		args.store === undefined
			? await vaultStoreOrInvalid()
			: { kind: "ok" as const, value: args.store };
	if (store.kind === "invalid") {
		return store;
	}
	const deleted = await store.value.deleteAccount({
		githubUserId: githubUserId.value,
		id: args.id,
	});
	if (deleted.kind === "invalid") {
		return deleted;
	}
	return deleted;
}
