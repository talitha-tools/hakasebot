/**
 * The one table of vendor endpoints and published clients. Adapters import from
 * here and the relay allowlist is derived from here, so there is no second list
 * to keep in sync. No GitHub host may ever appear in this file.
 */
import {
	ANTIGRAVITY_TOKEN_URL,
	antigravityOauthClient,
} from "#/antigravity-oauth.ts";
import type { ParseResult } from "#/domain.ts";
import { brandString, parseInvalid, parseOk } from "#/domain.ts";

import type { VendorTokenUrl } from "./domain.ts";

export const VENDOR_ENDPOINTS = {
	/** Mirrors common open-source vendor-CLI anthropic_auth.go. */
	claude: {
		authorize: "https://claude.ai/oauth/authorize",
		redirect: "http://localhost:54545/callback",
		token: "https://platform.claude.com/v1/oauth/token",
	},
	/** Mirrors common open-source vendor-CLI codex_device.go / openai_auth.go. */
	codex: {
		deviceCode: "https://auth.openai.com/api/accounts/deviceauth/usercode",
		devicePoll: "https://auth.openai.com/api/accounts/deviceauth/token",
		redirect: "https://auth.openai.com/deviceauth/callback",
		token: "https://auth.openai.com/oauth/token",
		verification: "https://auth.openai.com/codex/device",
	},
	/**
	 * xAI publishes these at `${issuer}/.well-known/openid-configuration`; the
	 * Grok CLI resolves them at runtime. Pinning them keeps the browser flow to
	 * one round trip, and `vendorTokenUrl` still gates what the relay may post to.
	 */
	grok: {
		deviceCode: "https://auth.x.ai/oauth2/device/code",
		discovery: "https://auth.x.ai/.well-known/openid-configuration",
		token: "https://auth.x.ai/oauth2/token",
	},
	/** Mirrors common open-source vendor-CLI ag_constants.go. */
	antigravity: {
		authorize: "https://accounts.google.com/o/oauth2/v2/auth",
		/** Dead loopback port: the browser fails to connect and the user pastes the address bar. */
		redirect: "http://localhost:51121/oauth-callback",
		token: ANTIGRAVITY_TOKEN_URL,
	},
} as const;

/** Published public clients. None is a hakasebot secret; none needs Deployment config. */
export const VENDOR_CLIENTS = {
	claude: {
		clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
		scope:
			"user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload",
	},
	codex: { clientId: "app_EMoamEEZ73f0CkXaXp7hrann" },
	grok: {
		clientId: "b1a00492-073a-47ea-816f-4c329264a828",
		issuer: "https://auth.x.ai",
		/**
		 * The issuer advertises more scopes than this, but only the set the Grok
		 * CLI client is registered for; asking wider earns an invalid_scope.
		 */
		scope: "openid profile email offline_access grok-cli:access api:access",
	},
} as const;

/** Google scopes the Antigravity desktop client asks for. */
export const ANTIGRAVITY_SCOPES = [
	"https://www.googleapis.com/auth/cloud-platform",
	"https://www.googleapis.com/auth/userinfo.email",
	"https://www.googleapis.com/auth/userinfo.profile",
	"https://www.googleapis.com/auth/cclog",
	"https://www.googleapis.com/auth/experimentsandconfigs",
] as const;

export function antigravityLoginClient(): {
	clientId: string;
	clientSecret: string;
	scope: string;
} {
	const client = antigravityOauthClient();
	return {
		clientId: client.clientId,
		clientSecret: client.clientSecret,
		scope: ANTIGRAVITY_SCOPES.join(" "),
	};
}

function postTarget(raw: string): VendorTokenUrl {
	return brandString(raw, "VendorTokenUrl");
}

/**
 * Every URL a login may POST to. Authorize, redirect, verification, and
 * discovery URLs are absent on purpose: the relay cannot be aimed at them.
 */
export const VENDOR_POST_TARGETS = {
	antigravityToken: postTarget(VENDOR_ENDPOINTS.antigravity.token),
	claudeToken: postTarget(VENDOR_ENDPOINTS.claude.token),
	codexDeviceCode: postTarget(VENDOR_ENDPOINTS.codex.deviceCode),
	codexDevicePoll: postTarget(VENDOR_ENDPOINTS.codex.devicePoll),
	codexToken: postTarget(VENDOR_ENDPOINTS.codex.token),
	grokDeviceCode: postTarget(VENDOR_ENDPOINTS.grok.deviceCode),
	grokToken: postTarget(VENDOR_ENDPOINTS.grok.token),
} as const satisfies Record<string, VendorTokenUrl>;

/** Derived, not maintained. */
export const RELAY_ALLOWLIST: readonly VendorTokenUrl[] =
	Object.values(VENDOR_POST_TARGETS);

/** Exact string membership. No prefix or host matching. */
export function vendorTokenUrl(raw: string): ParseResult<VendorTokenUrl> {
	for (const allowed of RELAY_ALLOWLIST) {
		if (allowed === raw) {
			return parseOk(allowed);
		}
	}
	return parseInvalid("that is not a vendor token endpoint");
}
