import {
	SECRET_NAMES,
	githubAppInstallationId,
	githubUserToken,
} from "@hakasebot/core/domain.ts";
import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import sodium, {
	base64_variants,
	from_base64,
	ready,
	to_base64,
	to_string,
} from "libsodium-wrappers";
import { afterEach, expect, test } from "vitest";

import { parseDeploymentConfig } from "#/env.ts";
import { writeActionsSecrets } from "#/github-secrets.server.ts";
import { hostedBotSecretWrite } from "#/hosted-bot-install.server.ts";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
	restoreFetch?.();
	restoreFetch = undefined;
});

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function configuredApp() {
	const parsed = parseDeploymentConfig({
		hostedAppClientId: "Iv23test",
		hostedAppPrivateKey: TEST_APP_PRIVATE_KEY,
		hostedAppSlug: "Hakase-Bot",
	});
	if (parsed.kind !== "ok" || parsed.value.hostedBotApp.kind !== "configured") {
		throw new Error("expected a configured Hosted bot App");
	}
	return parsed.value.hostedBotApp;
}

test("writeActionsSecrets seals with Workers-safe crypto_box_seal and PUTs ciphertext", async () => {
	await ready;
	const keyPair = sodium.crypto_box_keypair();
	const publicKey = to_base64(keyPair.publicKey, base64_variants.ORIGINAL);

	const puts: { name: string; encryptedValue: string; keyId: string }[] = [];
	restoreFetch = installGithubFetchMock({
		publicKey: () => ({
			json: { key_id: "key-1", key: publicKey },
		}),
		putSecret: (name, body) => {
			if (
				isRecord(body) &&
				typeof body["encrypted_value"] === "string" &&
				typeof body["key_id"] === "string"
			) {
				puts.push({
					name,
					encryptedValue: body["encrypted_value"],
					keyId: body["key_id"],
				});
			}
			return { status: 201, json: {} };
		},
	});

	const plaintext = TEST_APP_PRIVATE_KEY;
	const installationId = must(githubAppInstallationId("99"));
	const appWrite = hostedBotSecretWrite({
		hostedBotApp: configuredApp(),
		installationId,
	});
	const result = await writeActionsSecrets({
		userToken: must(githubUserToken("ghu_test")),
		repo: testRepoRef("talitha-tools/demo", "900001"),
		writes: [appWrite],
	});

	expect(result).toEqual({
		kind: "ok",
		names: [
			SECRET_NAMES.githubAppId,
			SECRET_NAMES.githubAppPrivateKey,
			SECRET_NAMES.githubAppInstallationId,
		],
	});
	expect(puts).toHaveLength(3);
	const privateKeyPut = puts.find(
		(put) => put.name === SECRET_NAMES.githubAppPrivateKey,
	);
	if (privateKeyPut === undefined) {
		return;
	}
	expect(privateKeyPut.keyId).toBe("key-1");
	expect(privateKeyPut.encryptedValue).not.toContain(plaintext);
	const opened = sodium.crypto_box_seal_open(
		from_base64(privateKeyPut.encryptedValue, base64_variants.ORIGINAL),
		keyPair.publicKey,
		keyPair.privateKey,
	);
	expect(to_string(opened)).toBe(plaintext);
});
