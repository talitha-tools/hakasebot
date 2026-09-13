/**
 * Vendor token JSON in, vault paste plaintext out. Every projection ends at
 * `validateCredentialPlaintext`, the same validator the paste box runs, so a
 * login can never mint something "lock it in" would reject.
 */
import type { ParseResult } from "#/domain.ts";
import { exhaustive, parseInvalid, parseOk } from "#/domain.ts";
import { validateCredentialPlaintext } from "#/vault/parse-credential.ts";
import { parseUnknown } from "#/zod-parse.ts";

import type { OauthEngine } from "./domain.ts";
import { decodeJwtPayload } from "./jwt.ts";
import {
	antigravityTokenSchema,
	claudeTokenSchema,
	codexAccountId,
	codexTokenSchema,
	grokIdentity,
	grokTokenSchema,
} from "./project-shapes.ts";
import { VENDOR_CLIENTS } from "./urls.ts";

/**
 * Below this a token would die before the first review runs, which means the
 * flow returned the interactive login class rather than the setup-token class.
 */
export const CLAUDE_MIN_TOKEN_LIFETIME_S = 30 * 24 * 60 * 60;

function sealed(engine: OauthEngine, plaintext: string): ParseResult<string> {
	const valid = validateCredentialPlaintext({ engine, plaintext });
	if (valid.kind === "invalid") {
		return parseInvalid(
			`${engine} handed back something the vault can't hold: ${valid.message}`,
		);
	}
	return parseOk(plaintext);
}

function isoAt(epochMs: number): string {
	return new Date(epochMs).toISOString();
}

/** Bare access token: the `CLAUDE_CODE_OAUTH_TOKEN` the review runtime exports. */
export function projectClaudeCredential(json: unknown): ParseResult<string> {
	const parsed = parseUnknown(claudeTokenSchema, json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	const expiresIn = parsed.value.expires_in;
	if (expiresIn !== undefined && expiresIn < CLAUDE_MIN_TOKEN_LIFETIME_S) {
		return parseInvalid(
			"claude gave a short-lived token. try Login again later",
		);
	}
	return sealed("claude", parsed.value.access_token);
}

/** `~/.codex/auth.json`, which the runtime writes verbatim for the codex CLI. */
export function projectCodexCredential(args: {
	json: unknown;
	now: number;
}): ParseResult<string> {
	const parsed = parseUnknown(codexTokenSchema, args.json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	const tokens = parsed.value;
	const claims = decodeJwtPayload(tokens.id_token);
	const accountId =
		claims.kind === "ok" ? codexAccountId(claims.value) : undefined;
	return sealed(
		"codex",
		JSON.stringify({
			// Codex CLI auth.json uses JSON null for the API key slot when OAuth tokens are present.
			// oxlint-disable-next-line unicorn/no-null -- wire shape matches ~/.codex/auth.json
			OPENAI_API_KEY: null,
			tokens: {
				id_token: tokens.id_token,
				access_token: tokens.access_token,
				refresh_token: tokens.refresh_token,
				...(accountId === undefined ? {} : { account_id: accountId }),
			},
			last_refresh: isoAt(args.now),
		}),
	);
}

/**
 * `~/.grok/auth.json`: a map keyed by `${issuer}::${client_id}` holding the
 * `GrokAuth` record the Grok CLI writes after an OIDC login.
 */
export function projectGrokCredential(args: {
	json: unknown;
	now: number;
}): ParseResult<string> {
	const parsed = parseUnknown(grokTokenSchema, args.json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	const tokens = parsed.value;
	const identity = grokIdentity(tokens.id_token);
	const { clientId, issuer } = VENDOR_CLIENTS.grok;
	const expiresIn = tokens.expires_in;
	return sealed(
		"grok",
		JSON.stringify({
			[`${issuer}::${clientId}`]: {
				key: tokens.access_token,
				auth_mode: "oidc",
				create_time: isoAt(args.now),
				user_id: identity.userId,
				email: identity.email,
				refresh_token: tokens.refresh_token,
				...(expiresIn === undefined
					? {}
					: { expires_at: isoAt(args.now + expiresIn * 1000) }),
				oidc_issuer: issuer,
				oidc_client_id: clientId,
			},
		}),
	);
}

/** The `agy` OAuth JSON of ADR-0033; `refresh_token` is what makes it holdable. */
export function projectAntigravityCredential(args: {
	json: unknown;
	now: number;
}): ParseResult<string> {
	const parsed = parseUnknown(antigravityTokenSchema, args.json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	const tokens = parsed.value;
	return sealed(
		"antigravity",
		JSON.stringify({
			auth_method: "consumer",
			token: {
				access_token: tokens.access_token,
				refresh_token: tokens.refresh_token,
				token_type: tokens.token_type ?? "Bearer",
				expiry: isoAt(args.now + tokens.expires_in * 1000),
			},
		}),
	);
}

export function projectVendorCredential(args: {
	engine: OauthEngine;
	json: unknown;
	now: number;
}): ParseResult<string> {
	switch (args.engine) {
		case "claude": {
			return projectClaudeCredential(args.json);
		}
		case "codex": {
			return projectCodexCredential({ json: args.json, now: args.now });
		}
		case "grok": {
			return projectGrokCredential({ json: args.json, now: args.now });
		}
		case "antigravity": {
			return projectAntigravityCredential({ json: args.json, now: args.now });
		}
		default: {
			return exhaustive(args.engine);
		}
	}
}
