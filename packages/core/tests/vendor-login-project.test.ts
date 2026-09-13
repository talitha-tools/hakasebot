import { expect, test } from "vitest";

import { base64UrlEncode } from "#/base64.ts";
import { parseAntigravityOauthFields } from "#/domain.ts";
import { parseCredentialPaste } from "#/vault/parse-credential.ts";
import {
	CLAUDE_MIN_TOKEN_LIFETIME_S,
	VENDOR_CLIENTS,
	projectAntigravityCredential,
	projectClaudeCredential,
	projectCodexCredential,
	projectGrokCredential,
	projectVendorCredential,
} from "#/vendor-login.ts";
import type { OauthEngine } from "#/vendor-login.ts";

const NOW = Date.UTC(2026, 0, 2, 3, 4, 5);
const YEAR_S = 365 * 24 * 60 * 60;

function fakeJwt(claims: Record<string, unknown>): string {
	return `header.${base64UrlEncode(JSON.stringify(claims))}.signature`;
}

/** Every projection has to survive the paste path the Lock it in button runs. */
function holdable(engine: OauthEngine, plaintext: string): unknown {
	const parsed = parseCredentialPaste({ engine, raw: plaintext });
	expect(parsed.kind).toBe("ok");
	return JSON.parse(plaintext);
}

test("claude projects the bare long-lived token the runtime exports", () => {
	const projected = projectClaudeCredential({
		access_token: "sk-ant-oat01-from-login",
		expires_in: YEAR_S,
	});
	expect(projected).toEqual({ kind: "ok", value: "sk-ant-oat01-from-login" });
	expect(
		parseCredentialPaste({ engine: "claude", raw: "sk-ant-oat01-from-login" })
			.kind,
	).toBe("ok");
});

test("claude refuses a token that dies before the first review", () => {
	const projected = projectClaudeCredential({
		access_token: "sk-ant-oat01-short",
		expires_in: CLAUDE_MIN_TOKEN_LIFETIME_S - 1,
	});
	expect(projected).toEqual({
		kind: "invalid",
		message: "claude gave a short-lived token. try Login again later",
	});
	expect(projectClaudeCredential({ access_token: "" }).kind).toBe("invalid");
	expect(projectClaudeCredential("just a string").kind).toBe("invalid");
});

test("codex projects ~/.codex/auth.json with the account id from the id token", () => {
	const idToken = fakeJwt({
		"https://api.openai.com/auth": { chatgpt_account_id: "acct_1234" },
	});
	const projected = projectCodexCredential({
		json: {
			access_token: "codex-access",
			id_token: idToken,
			refresh_token: "codex-refresh",
			token_type: "Bearer",
		},
		now: NOW,
	});
	expect(projected.kind).toBe("ok");
	if (projected.kind !== "ok") {
		return;
	}
	expect(holdable("codex", projected.value)).toEqual({
		// oxlint-disable-next-line unicorn/no-null -- wire shape matches ~/.codex/auth.json
		OPENAI_API_KEY: null,
		last_refresh: "2026-01-02T03:04:05.000Z",
		tokens: {
			access_token: "codex-access",
			account_id: "acct_1234",
			id_token: idToken,
			refresh_token: "codex-refresh",
		},
	});
});

test("codex needs the whole token set, and copes with an opaque id token", () => {
	expect(
		projectCodexCredential({
			json: { access_token: "a", id_token: fakeJwt({}) },
			now: NOW,
		}).kind,
	).toBe("invalid");
	const projected = projectCodexCredential({
		json: {
			access_token: "a",
			id_token: "not-a-jwt",
			refresh_token: "r",
		},
		now: NOW,
	});
	expect(projected.kind).toBe("ok");
	if (projected.kind === "ok") {
		expect(JSON.parse(projected.value)).not.toHaveProperty("tokens.account_id");
	}
});

test("grok projects the scope-keyed GrokAuth entry the CLI writes", () => {
	const projected = projectGrokCredential({
		json: {
			access_token: "xai-access",
			expires_in: 3600,
			id_token: fakeJwt({ email: "dev@example.test", sub: "user-42" }),
			refresh_token: "xai-refresh",
			token_type: "Bearer",
		},
		now: NOW,
	});
	expect(projected.kind).toBe("ok");
	if (projected.kind !== "ok") {
		return;
	}
	const scope = `${VENDOR_CLIENTS.grok.issuer}::${VENDOR_CLIENTS.grok.clientId}`;
	expect(holdable("grok", projected.value)).toEqual({
		[scope]: {
			auth_mode: "oidc",
			create_time: "2026-01-02T03:04:05.000Z",
			email: "dev@example.test",
			expires_at: "2026-01-02T04:04:05.000Z",
			key: "xai-access",
			oidc_client_id: VENDOR_CLIENTS.grok.clientId,
			oidc_issuer: VENDOR_CLIENTS.grok.issuer,
			refresh_token: "xai-refresh",
			user_id: "user-42",
		},
	});
});

test("grok insists on a refresh token an unattended review can use", () => {
	expect(
		projectGrokCredential({
			json: { access_token: "xai-access", expires_in: 3600 },
			now: NOW,
		}),
	).toEqual({
		kind: "invalid",
		message:
			"xai sent no refresh_token, so an unattended review could not refresh it",
	});
});

test("antigravity projects the agy oauth file, refresh token and all", () => {
	const projected = projectAntigravityCredential({
		json: {
			access_token: "ya29.access",
			expires_in: 3599,
			refresh_token: "1//04-refresh",
			token_type: "Bearer",
		},
		now: NOW,
	});
	expect(projected.kind).toBe("ok");
	if (projected.kind !== "ok") {
		return;
	}
	expect(holdable("antigravity", projected.value)).toEqual({
		auth_method: "consumer",
		token: {
			access_token: "ya29.access",
			expiry: "2026-01-02T04:04:04.000Z",
			refresh_token: "1//04-refresh",
			token_type: "Bearer",
		},
	});
	expect(parseAntigravityOauthFields(projected.value)).toEqual({
		kind: "ok",
		value: { refreshToken: "1//04-refresh" },
	});
});

test("antigravity without consent gives no refresh token, so nothing is minted", () => {
	expect(
		projectAntigravityCredential({
			json: { access_token: "ya29.access", expires_in: 3599 },
			now: NOW,
		}).kind,
	).toBe("invalid");
});

test("projectVendorCredential dispatches on engine", () => {
	expect(
		projectVendorCredential({
			engine: "claude",
			json: { access_token: "sk-ant-oat01-x" },
			now: NOW,
		}),
	).toEqual({ kind: "ok", value: "sk-ant-oat01-x" });
	expect(
		projectVendorCredential({ engine: "grok", json: {}, now: NOW }).kind,
	).toBe("invalid");
});
