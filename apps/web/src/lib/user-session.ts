import type { GithubUserToken, ParseResult } from "@hakasebot/core/domain.ts";
import { exhaustive } from "@hakasebot/core/domain.ts";
import { parseUnknown } from "@hakasebot/core/zod-parse.ts";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { env } from "#/env.ts";
import { githubUserIdFromDevUser, parseDevUser } from "#/lib/dev-user.ts";
import type { DevUser, DevUserOn } from "#/lib/dev-user.ts";
import type { AccessTokenFetcher } from "#/lib/github-session";
import { githubUserTokenFromSession } from "#/lib/github-session";
import { m as msg } from "#/paraglide/messages.js";

export type UserSession =
	| { kind: "oauth"; token: GithubUserToken }
	| { user: DevUserOn; kind: "dev" }
	| { kind: "missing" }
	| { kind: "error"; message: string };

function vitestRun(): boolean {
	const fromMeta: unknown = Reflect.get(import.meta.env, "VITEST");
	return fromMeta === true || fromMeta === "true";
}

function currentRequestUrl(): string | undefined {
	try {
		return getRequest().url;
	} catch {
		return undefined;
	}
}

/**
 * Vitest must not pick up `.env.local` flags. Browser and `bun run dev` still
 * load the fake User from env.
 */
export function loadDevUser(): DevUser {
	if (vitestRun()) {
		return { kind: "off" };
	}
	return parseDevUser({
		enabled: env.LAB_DEV_USER,
		githubUserId: env.LAB_DEV_GITHUB_USER_ID,
		requestUrl: currentRequestUrl(),
		token: env.LAB_DEV_GITHUB_TOKEN,
	});
}

/**
 * User token cookie first. Missing cookie (including stray browser cookies
 * and better-auth `UNAUTHORIZED` with no `account_data`) falls through to
 * the localhost fake User. A 401 while `account_data` is present, and
 * decrypt errors, stay errors so a broken account cookie is not papered
 * over.
 */
export async function readUserSession(args: {
	cookieHeader: string;
	devUser?: DevUser;
	getAccessToken?: AccessTokenFetcher;
	request?: Request;
}): Promise<UserSession> {
	const oauth = await githubUserTokenFromSession({
		cookieHeader: args.cookieHeader,
		...(args.getAccessToken === undefined
			? {}
			: { getAccessToken: args.getAccessToken }),
		...(args.request === undefined ? {} : { request: args.request }),
	});
	if (oauth.kind === "ok") {
		return { kind: "oauth", token: oauth.token };
	}
	if (oauth.kind === "error") {
		return oauth;
	}

	const dev = args.devUser ?? loadDevUser();
	if (dev.kind === "on") {
		return { kind: "dev", user: dev };
	}
	return { kind: "missing" };
}

export function tokenFromUserSession(
	session: UserSession,
): ParseResult<GithubUserToken> {
	switch (session.kind) {
		case "oauth": {
			return { kind: "ok", value: session.token };
		}
		case "dev": {
			if (session.user.github.kind === "token") {
				return { kind: "ok", value: session.user.github.token };
			}
			return { kind: "invalid", message: msg.dev_user_token_required() };
		}
		case "missing": {
			return {
				kind: "invalid",
				message: msg.session_expired(),
			};
		}
		case "error": {
			return { kind: "invalid", message: session.message };
		}
		default: {
			return exhaustive(session);
		}
	}
}

export type GithubUserFetcher = (args: {
	token: GithubUserToken;
}) => Promise<
	{ kind: "ok"; json: unknown } | { kind: "error"; message: string }
>;

const githubUserIdFieldSchema = z
	.number({ error: msg.github_user_id_missing() })
	.int({ error: msg.github_user_id_missing() })
	.positive({ error: msg.github_user_id_missing() });

const githubUserProfileSchema = z.object(
	{ id: githubUserIdFieldSchema },
	{ error: msg.github_user_not_object() },
);

export function githubUserIdFromProfile(json: unknown): ParseResult<string> {
	const parsed = parseUnknown(githubUserProfileSchema, json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return { kind: "ok", value: String(parsed.value.id) };
}

export async function githubUserIdFromUserSession(args: {
	fetchGithubUser: GithubUserFetcher;
	session: Extract<UserSession, { kind: "oauth" } | { kind: "dev" }>;
}): Promise<ParseResult<string>> {
	if (args.session.kind === "dev") {
		const known = githubUserIdFromDevUser(args.session.user);
		if (known.kind === "known") {
			return { kind: "ok", value: known.githubUserId };
		}
	}

	const token = tokenFromUserSession(args.session);
	if (token.kind === "invalid") {
		return token;
	}

	const profile = await args.fetchGithubUser({ token: token.value });
	if (profile.kind === "error") {
		return { kind: "invalid", message: profile.message };
	}
	return githubUserIdFromProfile(profile.json);
}
