import { z } from "zod";

import type { ParseResult } from "./domain/parse.ts";
import { parseInvalid, parseOk } from "./domain/parse.ts";
import type { CatalogHttp } from "./model-catalog.ts";
import { parseUnknown } from "./zod-parse.ts";

/** Google's published Antigravity desktop OAuth client, not a hakasebot secret. */
const CLIENT_ID = atob(
	"MTA3MTAwNjA2MDU5MS10bWhzc2luMmgyMWxjcmUyMzV2dG9sb2poNGc0MDNlcC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ==",
);
const CLIENT_SECRET = atob("R09DU1BYLUs1OEZXUjQ4NkxkTEoxbUxCOHNYQzR6NnFEQWY=");

export const ANTIGRAVITY_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const ANTIGRAVITY_PRIMARY_ENDPOINT =
	"https://daily-cloudcode-pa.googleapis.com";
export const ANTIGRAVITY_SANDBOX_ENDPOINT =
	"https://daily-cloudcode-pa.sandbox.googleapis.com";
export const FETCH_AVAILABLE_MODELS_PATH = "/v1internal:fetchAvailableModels";

const ANTIGRAVITY_HUB_VERSION = "2.8.0";
const ANTIGRAVITY_HUB_CL = "963137146";

/** The one place the published desktop client lives; vendor login reuses it. */
export function antigravityOauthClient(): {
	clientId: string;
	/** Google documents installed-app secrets as not confidential. */
	clientSecret: string;
	tokenUrl: string;
} {
	return {
		clientId: CLIENT_ID,
		clientSecret: CLIENT_SECRET,
		tokenUrl: ANTIGRAVITY_TOKEN_URL,
	};
}

export function antigravityUserAgent(): string {
	return `antigravity/hub/${ANTIGRAVITY_HUB_VERSION} (aidev_client; os_type=darwin; arch=arm64; cl=${ANTIGRAVITY_HUB_CL})`;
}

export function antigravityDiscoveryEndpoints(): readonly string[] {
	return [ANTIGRAVITY_PRIMARY_ENDPOINT, ANTIGRAVITY_SANDBOX_ENDPOINT];
}

export async function refreshAntigravityAccessToken(args: {
	fetchImpl: CatalogHttp;
	refreshToken: string;
}): Promise<ParseResult<string>> {
	const response = await args.fetchImpl(ANTIGRAVITY_TOKEN_URL, {
		body: new URLSearchParams({
			client_id: CLIENT_ID,
			client_secret: CLIENT_SECRET,
			grant_type: "refresh_token",
			refresh_token: args.refreshToken,
		}).toString(),
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		method: "POST",
	});
	if (!response.ok) {
		return parseInvalid(
			`antigravity token refresh failed (${String(response.status)})`,
		);
	}
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		return parseInvalid("antigravity token refresh is not JSON");
	}
	const parsed = parseUnknown(
		z.object(
			{
				access_token: z
					.string({
						error: "antigravity token refresh is missing access_token",
					})
					.min(1, {
						error: "antigravity token refresh is missing access_token",
					}),
			},
			{ error: "antigravity token refresh is not an object" },
		),
		payload,
	);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return parseOk(parsed.value.access_token);
}
