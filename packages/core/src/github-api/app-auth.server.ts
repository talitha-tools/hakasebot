import { base64ToBytes, base64UrlEncode } from "#/base64.ts";
import { githubToken } from "#/domain.ts";
import type {
	GithubAppId,
	GithubAppPrivateKey,
	GithubInstallationId,
	GithubToken,
	ParseResult,
	RepoRef,
} from "#/domain.ts";
import { errorMessage } from "#/error-message.ts";
import { parseUnknown } from "#/zod-parse.ts";

import {
	githubAppEventsSchema,
	githubAppHookUrlSchema,
	installationIdFromPayload,
	installationTokenSchema,
} from "./app-payload.ts";
import { githubFetch } from "./http.server.ts";

const textEncoder = new TextEncoder();

function normalizePem(pem: string): string {
	return pem
		.trim()
		.replaceAll("\r\n", "\n")
		.replaceAll(String.raw`\n`, "\n");
}

function derEncode(tag: number, contents: Uint8Array): Uint8Array<ArrayBuffer> {
	const lengthBytes: number[] = [];
	if (contents.length < 0x80) {
		lengthBytes.push(contents.length);
	} else {
		let remaining = contents.length;
		while (remaining > 0) {
			lengthBytes.unshift(remaining % 0x1_00);
			remaining = Math.floor(remaining / 0x1_00);
		}
		// DER long form: lead byte is 0x80 plus the count of length bytes.
		lengthBytes.unshift(0x80 + lengthBytes.length);
	}
	const encoded = new Uint8Array(1 + lengthBytes.length + contents.length);
	encoded.set([tag, ...lengthBytes]);
	encoded.set(contents, 1 + lengthBytes.length);
	return encoded;
}

// PKCS#1 RSAPrivateKey -> PKCS#8 PrivateKeyInfo: version 0 + rsaEncryption OID + key as OCTET STRING.
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
	const versionAndAlgorithm = Uint8Array.from([
		0x02, 0x01, 0x00, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7,
		0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
	]);
	const privateKey = derEncode(0x04, pkcs1);
	const body = new Uint8Array(versionAndAlgorithm.length + privateKey.length);
	body.set(versionAndAlgorithm);
	body.set(privateKey, versionAndAlgorithm.length);
	return derEncode(0x30, body);
}

const RSA_SIGN_ALGORITHM = { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" };

async function importAppPrivateKey(pem: string): Promise<CryptoKey> {
	const normalized = normalizePem(pem);
	const der = base64ToBytes(
		normalized.replaceAll(/-----(?:BEGIN|END) (?:RSA )?PRIVATE KEY-----/gu, ""),
	);
	// GitHub App .pem downloads are PKCS#1; WebCrypto only imports PKCS#8, so wrap the DER.
	const pkcs8 = normalized.includes("BEGIN RSA PRIVATE KEY")
		? pkcs1ToPkcs8(der)
		: der;
	return crypto.subtle.importKey("pkcs8", pkcs8, RSA_SIGN_ALGORITHM, false, [
		"sign",
	]);
}

export async function signAppJwt(args: {
	appId: GithubAppId;
	privateKey: GithubAppPrivateKey;
}): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const header = { alg: "RS256", typ: "JWT" };
	const payload = {
		iat: now - 60,
		exp: now + 600,
		iss: args.appId,
	};
	const encodedHeader = base64UrlEncode(JSON.stringify(header));
	const encodedPayload = base64UrlEncode(JSON.stringify(payload));
	const signingInput = `${encodedHeader}.${encodedPayload}`;
	try {
		const key = await importAppPrivateKey(args.privateKey);
		const signature = await crypto.subtle.sign(
			RSA_SIGN_ALGORITHM.name,
			key,
			textEncoder.encode(signingInput),
		);
		return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
	} catch {
		throw new Error(
			"github app private key PEM could not be parsed — download a new .pem from the App settings",
		);
	}
}

export interface InstallationGrant {
	expiresAt: number;
	token: GithubToken;
}

/** Skinny subset minted for Wake, dispatch, and posting. Never admin / contents-write / workflows. */
export const BOT_INSTALLATION_PERMISSIONS = {
	actions: "write",
	contents: "read",
	issues: "write",
	metadata: "read",
	pull_requests: "write",
} as const;

export async function mintInstallationToken(args: {
	appId: GithubAppId;
	privateKey: GithubAppPrivateKey;
	installationId: GithubInstallationId;
}): Promise<ParseResult<InstallationGrant>> {
	const jwt = await signAppJwt({
		appId: args.appId,
		privateKey: args.privateKey,
	});
	const bearer = githubToken(jwt);
	if (bearer.kind === "invalid") {
		return bearer;
	}
	const response = await githubFetch({
		body: { permissions: BOT_INSTALLATION_PERMISSIONS },
		token: bearer.value,
		path: `/app/installations/${args.installationId}/access_tokens`,
		method: "POST",
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const body = parseUnknown(installationTokenSchema, response.json);
	if (body.kind === "invalid") {
		return body;
	}
	const token = githubToken(body.value.token);
	if (token.kind === "invalid") {
		return token;
	}
	const expiresAt = Date.parse(body.value.expires_at);
	if (Number.isNaN(expiresAt)) {
		return {
			kind: "invalid",
			message: "installation token response expires_at is invalid",
		};
	}
	return { kind: "ok", value: { expiresAt, token: token.value } };
}

export async function fetchRepoInstallation(args: {
	appId: GithubAppId;
	privateKey: GithubAppPrivateKey;
	repo: RepoRef;
}): Promise<ParseResult<GithubInstallationId>> {
	const jwt = await signAppJwt({
		appId: args.appId,
		privateKey: args.privateKey,
	});
	const bearer = githubToken(jwt);
	if (bearer.kind === "invalid") {
		return bearer;
	}
	const response = await githubFetch({
		token: bearer.value,
		path: `/repos/${args.repo.owner}/${args.repo.name}/installation`,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return installationIdFromPayload(response.json, "repository");
}

/**
 * Resolve the Hosted bot App installation for an account login.
 * Tries user then org; 404 on both means the App is not installed there.
 */
export async function fetchAccountInstallation(args: {
	appId: GithubAppId;
	privateKey: GithubAppPrivateKey;
	accountLogin: string;
}): Promise<
	| { kind: "ok"; value: GithubInstallationId }
	| { kind: "missing" }
	| { kind: "invalid"; message: string }
> {
	const jwt = await signAppJwt({
		appId: args.appId,
		privateKey: args.privateKey,
	});
	const bearer = githubToken(jwt);
	if (bearer.kind === "invalid") {
		return bearer;
	}
	const login = encodeURIComponent(args.accountLogin);
	const userResponse = await githubFetch({
		token: bearer.value,
		path: `/users/${login}/installation`,
	});
	if (userResponse.kind === "ok") {
		return installationIdFromPayload(userResponse.json, "user");
	}
	if (userResponse.status !== 404) {
		return { kind: "invalid", message: userResponse.message };
	}
	const orgResponse = await githubFetch({
		token: bearer.value,
		path: `/orgs/${login}/installation`,
	});
	if (orgResponse.kind === "ok") {
		return installationIdFromPayload(orgResponse.json, "org");
	}
	if (orgResponse.status === 404) {
		return { kind: "missing" };
	}
	return { kind: "invalid", message: orgResponse.message };
}

export interface GithubAppWebhookSettings {
	events: ParseResult<string[]>;
	url: ParseResult<string>;
}

function bothInvalid(message: string): GithubAppWebhookSettings {
	const invalid = { kind: "invalid" as const, message };
	return { events: invalid, url: invalid };
}

function eventsFromAppPayload(json: unknown): ParseResult<string[]> {
	const parsed = parseUnknown(githubAppEventsSchema, json);
	return parsed.kind === "ok"
		? { kind: "ok", value: parsed.value.events }
		: parsed;
}

function urlFromHookConfig(json: unknown): ParseResult<string> {
	const parsed = parseUnknown(githubAppHookUrlSchema, json);
	return parsed.kind === "ok"
		? { kind: "ok", value: parsed.value.url }
		: parsed;
}

export async function fetchGithubAppWebhookSettings(args: {
	appId: GithubAppId;
	privateKey: GithubAppPrivateKey;
}): Promise<GithubAppWebhookSettings> {
	try {
		const jwt = await signAppJwt({
			appId: args.appId,
			privateKey: args.privateKey,
		});
		const bearer = githubToken(jwt);
		if (bearer.kind === "invalid") {
			return bothInvalid(bearer.message);
		}
		const [appResponse, hookResponse] = await Promise.all([
			githubFetch({ token: bearer.value, path: "/app" }),
			githubFetch({ token: bearer.value, path: "/app/hook/config" }),
		]);
		return {
			events:
				appResponse.kind === "error"
					? { kind: "invalid", message: appResponse.message }
					: eventsFromAppPayload(appResponse.json),
			url:
				hookResponse.kind === "error"
					? { kind: "invalid", message: hookResponse.message }
					: urlFromHookConfig(hookResponse.json),
		};
	} catch (error: unknown) {
		return bothInvalid(errorMessage(error, "couldn't read github app webhook"));
	}
}
