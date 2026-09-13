import { base64Encode, base64ToBytes } from "@hakasebot/core/base64.ts";
/**
 * Browser-only GitHub Actions secret writes. Encryption key
 * never leaves the client except via GitHub's libsodium-sealed PUT.
 */
import { cryptoBoxSeal } from "@hakasebot/core/crypto-box-seal.ts";
import type {
	GithubUserToken,
	ParseResult,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import { VAULT_SECRET_NAMES } from "@hakasebot/core/vault/domain.ts";
import type { EncryptionKey } from "@hakasebot/core/vault/domain.ts";
import { parseUnknown } from "@hakasebot/core/zod-parse.ts";
import { z } from "zod";

import { m as msg } from "#/paraglide/messages.js";

const GITHUB_API = "https://api.github.com";

const githubPublicKeySchema = z.object(
	{
		key: z.string({ error: msg.github_public_key_missing() }),
		key_id: z.string({ error: msg.github_public_key_missing() }),
	},
	{ error: msg.github_public_key_invalid() },
);

function encryptForGitHub(args: {
	publicKeyBase64: string;
	secretValue: string;
}): string {
	const key = base64ToBytes(args.publicKeyBase64);
	const message = new TextEncoder().encode(args.secretValue);
	return base64Encode(cryptoBoxSeal({ message, recipientPublicKey: key }));
}

async function githubFetch(args: {
	token: GithubUserToken;
	path: string;
	method?: string;
	body?: unknown;
}): Promise<
	| { kind: "ok"; status: number; json: unknown }
	| { kind: "error"; status: number; message: string }
> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${args.token}`,
		"User-Agent": "hakasebot-lab",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	const init: RequestInit = {
		headers,
		method: args.method ?? "GET",
	};
	if (args.body !== undefined) {
		headers["Content-Type"] = "application/json";
		init.body = JSON.stringify(args.body);
	}
	const response = await fetch(`${GITHUB_API}${args.path}`, init);
	let json: unknown;
	try {
		json = await response.json();
	} catch {
		json = undefined;
	}
	if (!response.ok) {
		const error = z.object({ message: z.string() }).safeParse(json);
		const message = error.success
			? error.data.message
			: `GitHub API ${String(response.status)}`;
		return { kind: "error", message, status: response.status };
	}
	return { kind: "ok", json, status: response.status };
}

async function fetchRepoPublicKey(args: {
	repo: RepoRef;
	token: GithubUserToken;
}): Promise<ParseResult<{ key: string; keyId: string }>> {
	const path = `/repos/${args.repo.owner}/${args.repo.name}/actions/secrets/public-key`;
	const response = await githubFetch({ path, token: args.token });
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const parsed = parseUnknown(githubPublicKeySchema, response.json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return {
		kind: "ok",
		value: { key: parsed.value.key, keyId: parsed.value.key_id },
	};
}

async function putRepoSecret(args: {
	encryptedValue: string;
	keyId: string;
	name: string;
	repo: RepoRef;
	token: GithubUserToken;
}): Promise<ParseResult<void>> {
	const path = `/repos/${args.repo.owner}/${args.repo.name}/actions/secrets/${args.name}`;
	const response = await githubFetch({
		body: {
			encrypted_value: args.encryptedValue,
			key_id: args.keyId,
		},
		method: "PUT",
		path,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return { kind: "ok", value: undefined };
}

export async function syncVaultSecretsFromBrowser(args: {
	githubToken: GithubUserToken;
	repo: RepoRef;
	secrets: {
		encryptionKey: EncryptionKey;
	};
}): Promise<ParseResult<readonly string[]>> {
	const publicKey = await fetchRepoPublicKey({
		repo: args.repo,
		token: args.githubToken,
	});
	if (publicKey.kind === "invalid") {
		return publicKey;
	}
	const name = VAULT_SECRET_NAMES.encryptionKey;
	const encrypted = encryptForGitHub({
		publicKeyBase64: publicKey.value.key,
		secretValue: args.secrets.encryptionKey,
	});
	const put = await putRepoSecret({
		encryptedValue: encrypted,
		keyId: publicKey.value.keyId,
		name,
		repo: args.repo,
		token: args.githubToken,
	});
	if (put.kind === "invalid") {
		return put;
	}
	return { kind: "ok", value: [name] };
}
