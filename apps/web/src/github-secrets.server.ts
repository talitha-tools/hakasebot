import { base64Encode, base64ToBytes } from "@hakasebot/core/base64.ts";
import { cryptoBoxSeal } from "@hakasebot/core/crypto-box-seal.ts";
import { SECRET_NAMES } from "@hakasebot/core/domain.ts";
import type {
	AppSecretWrite,
	GithubUserToken,
	NonEmpty,
	RepoRef,
	WriteSecretsResult,
} from "@hakasebot/core/domain.ts";
import {
	fetchRepoPublicKey,
	putRepoSecret,
} from "@hakasebot/core/github-api.server.ts";

import { m as msg } from "#/paraglide/messages.js";

function encryptSecret(args: {
	publicKeyBase64: string;
	secretValue: string;
}): string {
	const key = base64ToBytes(args.publicKeyBase64);
	const message = new TextEncoder().encode(args.secretValue);
	return base64Encode(cryptoBoxSeal({ message, recipientPublicKey: key }));
}

function secretEntries(
	write: AppSecretWrite,
): { name: string; value: string }[] {
	return [
		{
			name: SECRET_NAMES.githubAppId,
			value: write.appId,
		},
		{
			name: SECRET_NAMES.githubAppPrivateKey,
			value: write.privateKey,
		},
		{
			name: SECRET_NAMES.githubAppInstallationId,
			value: write.installationId,
		},
	];
}

export async function writeActionsSecrets(args: {
	userToken: GithubUserToken;
	repo: RepoRef;
	writes: NonEmpty<AppSecretWrite>;
}): Promise<WriteSecretsResult> {
	const publicKey = await fetchRepoPublicKey({
		repo: args.repo,
		token: args.userToken,
	});
	if (publicKey.kind === "invalid") {
		return { kind: "invalid", message: publicKey.message };
	}

	const names: string[] = [];
	for (const write of args.writes) {
		for (const entry of secretEntries(write)) {
			const encrypted = encryptSecret({
				publicKeyBase64: publicKey.value.key,
				secretValue: entry.value,
			});
			// oxlint-disable-next-line eslint/no-await-in-loop -- serial PUTs; concurrent GitHub mutations trip secondary rate limits
			const put = await putRepoSecret({
				encryptedValue: encrypted,
				keyId: publicKey.value.keyId,
				name: entry.name,
				repo: args.repo,
				token: args.userToken,
			});
			if (put.kind === "invalid") {
				return { kind: "invalid", message: put.message };
			}
			names.push(entry.name);
		}
	}

	const [first, ...rest] = names;
	if (first === undefined) {
		return { kind: "invalid", message: msg.no_secret_names_written() };
	}
	return { kind: "ok", names: [first, ...rest] };
}
