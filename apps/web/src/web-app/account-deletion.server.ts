import { createAppDb } from "@hakasebot/core/db/client.ts";
import type { ParseResult } from "@hakasebot/core/domain.ts";

import { d1FromWorkerEnv } from "#/home/store.ts";
import { m as msg } from "#/paraglide/messages.js";

import type {
	AccountDeletionPreview,
	AccountDeletionStore,
} from "./account-deletion-store.ts";
import { createAccountDeletionStore } from "./account-deletion-store.ts";
import type { UserSessionDeps } from "./accounts.server.ts";
import { userGithubUserId } from "./accounts.server.ts";

async function storeForUser(
	args: UserSessionDeps & { deletionStore?: AccountDeletionStore },
): Promise<ParseResult<AccountDeletionStore>> {
	if (args.deletionStore !== undefined) {
		return { kind: "ok", value: args.deletionStore };
	}
	const db = await d1FromWorkerEnv();
	if (db === undefined) {
		return { kind: "invalid", message: msg.vault_store_unbound() };
	}
	return { kind: "ok", value: createAccountDeletionStore(createAppDb(db)) };
}

export async function previewAccountDeletion(
	args: UserSessionDeps & { deletionStore?: AccountDeletionStore },
): Promise<ParseResult<AccountDeletionPreview>> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store = await storeForUser(args);
	if (store.kind === "invalid") {
		return store;
	}
	return store.value.previewAccountDeletion({
		githubUserId: githubUserId.value,
	});
}

export async function deleteAccount(
	args: UserSessionDeps & { deletionStore?: AccountDeletionStore },
): Promise<ParseResult<void>> {
	const githubUserId = await userGithubUserId(args);
	if (githubUserId.kind === "invalid") {
		return githubUserId;
	}
	const store = await storeForUser(args);
	if (store.kind === "invalid") {
		return store;
	}
	return store.value.deleteAccount({
		githubUserId: githubUserId.value,
	});
}
