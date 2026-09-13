/** Zod at the edge: the vendor token JSON shapes a login is willing to read. */
import { z } from "zod";

import { parseUnknown } from "#/zod-parse.ts";

import { decodeJwtPayload } from "./jwt.ts";

function requiredString(missing: string) {
	return z.string({ error: missing }).min(1, { error: missing });
}

const expiresInSchema = z
	.number({ error: "expires_in is not a number" })
	.int()
	.positive()
	.optional();

export const claudeTokenSchema = z.object(
	{
		access_token: requiredString("anthropic sent no access_token"),
		expires_in: expiresInSchema,
	},
	{ error: "anthropic sent something that is not a token response" },
);

export const codexTokenSchema = z.object(
	{
		access_token: requiredString("openai sent no access_token"),
		id_token: requiredString("openai sent no id_token"),
		refresh_token: requiredString("openai sent no refresh_token"),
	},
	{ error: "openai sent something that is not a token response" },
);

export const grokTokenSchema = z.object(
	{
		access_token: requiredString("xai sent no access_token"),
		expires_in: expiresInSchema,
		id_token: z.string().optional(),
		refresh_token: requiredString(
			"xai sent no refresh_token, so an unattended review could not refresh it",
		),
	},
	{ error: "xai sent something that is not a token response" },
);

export const antigravityTokenSchema = z.object(
	{
		access_token: requiredString("google sent no access_token"),
		expires_in: z
			.number({ error: "google sent no expires_in" })
			.int()
			.positive(),
		refresh_token: requiredString(
			"google sent no refresh_token. authorise again and accept the consent screen",
		),
		token_type: z.string().optional(),
	},
	{ error: "google sent something that is not a token response" },
);

const codexClaimsSchema = z.object({
	"https://api.openai.com/auth": z
		.object({ chatgpt_account_id: z.string().min(1).optional() })
		.optional(),
});

/** The ChatGPT account the codex CLI sends with every request. */
export function codexAccountId(claims: unknown): string | undefined {
	const parsed = parseUnknown(codexClaimsSchema, claims);
	if (parsed.kind === "invalid") {
		return undefined;
	}
	return parsed.value["https://api.openai.com/auth"]?.chatgpt_account_id;
}

const grokClaimsSchema = z.object({
	email: z.string().optional(),
	sub: z.string().optional(),
});

/**
 * The id token is optional and never verified here, so an absent or unreadable
 * one leaves the identity blank rather than failing the login.
 */
export function grokIdentity(idToken: string | undefined): {
	email: string | undefined;
	userId: string;
} {
	if (idToken === undefined) {
		return { email: undefined, userId: "" };
	}
	const payload = decodeJwtPayload(idToken);
	if (payload.kind === "invalid") {
		return { email: undefined, userId: "" };
	}
	const claims = parseUnknown(grokClaimsSchema, payload.value);
	if (claims.kind === "invalid") {
		return { email: undefined, userId: "" };
	}
	return { email: claims.value.email, userId: claims.value.sub ?? "" };
}
