import type { ParseResult } from "./parse.ts";
import { brandString, parseInvalid, parseOk, requireText } from "./parse.ts";

export type GithubToken = string & { readonly __brand: "GithubToken" };
export type GithubUserToken = string & {
	readonly __brand: "GithubUserToken";
};
/** JWT `iss`: GitHub App client ID, or a leftover numeric App ID from a Home secret. */
export type GithubAppId = string & { readonly __brand: "GithubAppId" };
export type GithubAppSlug = string & { readonly __brand: "GithubAppSlug" };
export type GithubAppPrivateKey = string & {
	readonly __brand: "GithubAppPrivateKey";
};
export type GithubInstallationId = string & {
	readonly __brand: "GithubInstallationId";
};

export type Bot =
	| { kind: "actions-bot"; token: GithubToken }
	| {
			kind: "app";
			appId: GithubAppId;
			privateKey: GithubAppPrivateKey;
			installationId: GithubInstallationId;
	  };

export interface AppSecretWrite {
	kind: "app";
	appId: GithubAppId;
	privateKey: GithubAppPrivateKey;
	installationId: GithubInstallationId;
}

export const SECRET_NAMES = {
	githubAppId: "HAKASEBOT_APP_ID",
	githubAppPrivateKey: "HAKASEBOT_APP_PRIVATE_KEY",
	githubAppInstallationId: "HAKASEBOT_APP_INSTALLATION_ID",
} as const;

export function githubToken(value: string): ParseResult<GithubToken> {
	const parsed = requireText(value, "github_token");
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return parseOk(brandString(parsed.value, "GithubToken"));
}

export function githubUserToken(value: string): ParseResult<GithubUserToken> {
	const parsed = requireText(value, "github user token");
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return parseOk(brandString(parsed.value, "GithubUserToken"));
}

export function githubAppId(value: string): ParseResult<GithubAppId> {
	const parsed = requireText(value, "github_app_id");
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return parseOk(brandString(parsed.value, "GithubAppId"));
}

const APP_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;

export function githubAppSlug(
	value: string,
	label = "github app slug",
): ParseResult<GithubAppSlug> {
	const slug = value.trim().toLowerCase();
	if (slug.length === 0) {
		return parseInvalid(`${label} is empty`);
	}
	if (!APP_SLUG_PATTERN.test(slug)) {
		return parseInvalid(`${label} must be a GitHub App slug`);
	}
	return parseOk(brandString(slug, "GithubAppSlug"));
}

export function githubAppPrivateKey(
	value: string,
): ParseResult<GithubAppPrivateKey> {
	const parsed = requireText(value, "github_app_private_key");
	if (parsed.kind === "invalid") {
		return parsed;
	}
	let pem = parsed.value.trim();
	if (
		(pem.startsWith('"') && pem.endsWith('"')) ||
		(pem.startsWith("'") && pem.endsWith("'"))
	) {
		pem = pem.slice(1, -1).trim();
	}
	pem = pem.replaceAll("\r\n", "\n").replaceAll(String.raw`\n`, "\n");
	if (
		!(
			pem.includes("BEGIN") &&
			pem.includes("PRIVATE KEY") &&
			pem.includes("END")
		)
	) {
		return parseInvalid(
			"github app private key must be a PEM (-----BEGIN … PRIVATE KEY-----), not a client secret",
		);
	}
	return parseOk(brandString(pem, "GithubAppPrivateKey"));
}

export function githubAppInstallationId(
	value: string,
): ParseResult<GithubInstallationId> {
	const parsed = requireText(value, "github_app_installation_id");
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return parseOk(brandString(parsed.value, "GithubInstallationId"));
}
