import { githubUserToken, repoRef } from "@hakasebot/core/domain.ts";
import { generateEncryptionKey } from "@hakasebot/core/vault/crypto.ts";
import { VAULT_SECRET_NAMES } from "@hakasebot/core/vault/domain.ts";
import { buildRepoSyncPayload } from "@hakasebot/core/vault/store.ts";
import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import { syncVaultSecretsFromBrowser } from "#/vault/github-secrets.client.ts";

test("buildRepoSyncPayload is encryption key only", () => {
	const encryptionKey = generateEncryptionKey();
	expect(buildRepoSyncPayload({ encryptionKey })).toEqual({ encryptionKey });
	expect(Object.keys(buildRepoSyncPayload({ encryptionKey }))).toEqual([
		"encryptionKey",
	]);
});

test("syncVaultSecretsFromBrowser writes only the encryption key secret", async () => {
	const encryptionKey = generateEncryptionKey();
	const repo = must(
		repoRef({ id: "1", name: "review-home", owner: "talitha-tools" }),
	);
	const publicKey = btoa(
		String.fromCodePoint(...Array.from({ length: 32 }, () => 1)),
	);
	const written: string[] = [];
	const restore = installGithubFetchMock({
		publicKey: () => ({
			json: { key: publicKey, key_id: "key-1" },
			status: 200,
		}),
		putSecret: (name) => {
			written.push(name);
			return { json: {}, status: 204 };
		},
	});
	try {
		const synced = await syncVaultSecretsFromBrowser({
			githubToken: must(githubUserToken("ghu_test")),
			repo,
			secrets: buildRepoSyncPayload({ encryptionKey }),
		});
		expect(synced).toEqual({
			kind: "ok",
			value: [VAULT_SECRET_NAMES.encryptionKey],
		});
		expect(written).toEqual([VAULT_SECRET_NAMES.encryptionKey]);
	} finally {
		restore();
	}
});
