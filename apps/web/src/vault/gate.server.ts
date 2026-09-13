import type { ParseResult } from "@hakasebot/core/domain.ts";
import { githubFetch } from "@hakasebot/core/github-api.server.ts";
import { isRecord } from "@hakasebot/core/is-record.ts";
import type { VaultGateSnapshot } from "@hakasebot/core/vault/domain.ts";
import type {
	D1DatabaseLike,
	VaultStore,
} from "@hakasebot/core/vault/store.ts";
import { createD1VaultStore } from "@hakasebot/core/vault/store.ts";

import type { DevUser } from "#/lib/dev-user.ts";
import type { AccessTokenFetcher } from "#/lib/github-session";
import {
	githubUserIdFromUserSession,
	readUserSession,
} from "#/lib/user-session";
import type { GithubUserFetcher } from "#/lib/user-session";
import { m as msg } from "#/paraglide/messages.js";

export type { VaultGateSnapshot } from "@hakasebot/core/vault/domain.ts";

function isD1Database(value: unknown): value is D1DatabaseLike {
	return isRecord(value) && typeof value["prepare"] === "function";
}

const fetchGithubUserFromApi: GithubUserFetcher = async ({ token }) => {
	const response = await githubFetch({
		path: "/user",
		token,
	});
	if (response.kind === "error") {
		return { kind: "error", message: response.message };
	}
	return { kind: "ok", json: response.json };
};

export async function vaultStoreFromWorkerEnv(): Promise<
	VaultStore | undefined
> {
	try {
		const workers: unknown = await import("cloudflare:workers");
		if (!isRecord(workers)) {
			return undefined;
		}
		const { env } = workers;
		if (!isRecord(env)) {
			return undefined;
		}
		const { DB: db } = env;
		if (!isD1Database(db)) {
			return undefined;
		}
		return createD1VaultStore(db);
	} catch {
		return undefined;
	}
}

export async function readVaultStoreOrInvalid(): Promise<
	ParseResult<VaultStore>
> {
	const store = await vaultStoreFromWorkerEnv();
	if (store === undefined) {
		return {
			kind: "invalid",
			message: msg.vault_store_unbound(),
		};
	}
	return { kind: "ok", value: store };
}

type GateStore = Pick<
	VaultStore,
	"countAccounts" | "getFirstSealedAccount" | "readVaultEpoch"
>;

async function resolveGithubUserId(args: {
	cookieHeader: string;
	devUser?: DevUser;
	getAccessToken?: AccessTokenFetcher;
	fetchGithubUser?: GithubUserFetcher;
	request?: Request;
}): Promise<ParseResult<string>> {
	const session = await readUserSession({
		cookieHeader: args.cookieHeader,
		...(args.devUser === undefined ? {} : { devUser: args.devUser }),
		...(args.getAccessToken === undefined
			? {}
			: { getAccessToken: args.getAccessToken }),
		...(args.request === undefined ? {} : { request: args.request }),
	});
	if (session.kind === "missing") {
		return {
			kind: "invalid",
			message: msg.session_expired(),
		};
	}
	if (session.kind === "error") {
		return { kind: "invalid", message: session.message };
	}
	return githubUserIdFromUserSession({
		session,
		fetchGithubUser: args.fetchGithubUser ?? fetchGithubUserFromApi,
	});
}

async function readGateSnapshotFromStore(args: {
	githubUserId: string;
	store: GateStore;
}): Promise<ParseResult<VaultGateSnapshot>> {
	const { githubUserId, store } = args;
	const accountCount = await store.countAccounts({ githubUserId });
	if (accountCount.kind === "invalid") {
		return accountCount;
	}
	const epoch = await store.readVaultEpoch({ githubUserId });
	if (epoch.kind === "invalid") {
		return epoch;
	}
	const sample =
		accountCount.value > 0
			? await store.getFirstSealedAccount({ githubUserId })
			: { kind: "ok" as const, value: undefined };
	if (sample.kind === "invalid") {
		return sample;
	}
	return {
		kind: "ok",
		value: {
			accountCount: accountCount.value,
			epoch: epoch.value,
			githubUserId,
			sample: sample.value,
		},
	};
}

export async function readVaultGateSnapshot(args: {
	cookieHeader: string;
	devUser?: DevUser;
	getAccessToken?: AccessTokenFetcher;
	fetchGithubUser?: GithubUserFetcher;
	request?: Request;
	store?: GateStore;
}): Promise<ParseResult<VaultGateSnapshot>> {
	const githubUserId = await resolveGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store = args.store ?? (await vaultStoreFromWorkerEnv());
	if (store === undefined) {
		return {
			kind: "invalid",
			message: msg.vault_store_unbound_no_key(),
		};
	}
	return readGateSnapshotFromStore({ githubUserId: githubUserId.value, store });
}
