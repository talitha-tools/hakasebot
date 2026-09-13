import type { GithubUserToken } from "@hakasebot/core/domain.ts";
import { isRecord, readNumber, readString } from "@hakasebot/core/is-record.ts";
import { getRequest } from "@tanstack/react-start/server";

import { githubUserTokenFromAccessToken } from "#/lib/github-user-token";
import { m as msg } from "#/paraglide/messages.js";

/**
 * Outcome of reading the GitHub App User token from the sealed session.
 * Discriminated so missing cookies are not confused with decrypt/API failures.
 */
export type GithubUserSessionResult =
	| { kind: "ok"; token: GithubUserToken }
	| { kind: "missing" }
	| { kind: "error"; message: string };

export type AccessTokenFetcher = (args: {
	body: { useAccountCookie: true };
	headers: Headers;
	request?: Request;
}) => Promise<{ accessToken: string }>;

const BETTER_AUTH_SESSION_OR_ACCOUNT_COOKIE =
	/(?:^|;\s*)(?:__Secure-)?better-auth\.(?:session_token|session_data|account_data)(?:\.|=)/u;

const BETTER_AUTH_ACCOUNT_COOKIE =
	/(?:^|;\s*)(?:__Secure-)?better-auth\.account_data(?:\.|=)/u;

/**
 * True when the Cookie header carries a better-auth session or account
 * cookie (including `__Secure-` and chunked names). OAuth state cookies
 * and unrelated browser cookies do not count.
 */
export function cookieHeaderHasBetterAuthSessionOrAccount(
	cookieHeader: string,
): boolean {
	return BETTER_AUTH_SESSION_OR_ACCOUNT_COOKIE.test(cookieHeader);
}

function cookieHeaderHasBetterAuthAccount(cookieHeader: string): boolean {
	return BETTER_AUTH_ACCOUNT_COOKIE.test(cookieHeader);
}

/**
 * Map a raw access-token string into a session Result (no I/O).
 */
export function githubUserSessionResultFromAccessToken(args: {
	accessToken: string | undefined;
}): GithubUserSessionResult {
	const token = githubUserTokenFromAccessToken({
		accessToken: args.accessToken,
	});
	if (token === undefined) {
		return { kind: "missing" };
	}
	return { kind: "ok", token };
}

function currentRequest(): Request | undefined {
	try {
		return getRequest();
	} catch {
		return undefined;
	}
}

async function defaultGetAccessToken(
	opts: Parameters<AccessTokenFetcher>[0],
): Promise<{ accessToken: string }> {
	const { auth } = await import("#/lib/auth");
	return auth.api.getAccessToken({
		...opts,
		asResponse: false,
	});
}

function isUnauthorizedSessionError(error: unknown): boolean {
	if (!isRecord(error)) {
		return false;
	}
	if (error["status"] === "UNAUTHORIZED") {
		return true;
	}
	return readNumber(error["statusCode"]) === 401;
}

function sessionErrorMessage(error: unknown): string {
	if (error instanceof Error) {
		const trimmed = error.message.trim();
		if (trimmed !== "") {
			return trimmed;
		}
	}
	const status = isRecord(error) ? readString(error["status"]) : undefined;
	if (status !== undefined && status.trim() !== "") {
		return status;
	}
	return msg.github_session_read_failed();
}

function cookieHeaderForSession(args: {
	cookieHeader: string;
	request: Request | undefined;
}): string {
	if (cookieHeaderHasBetterAuthSessionOrAccount(args.cookieHeader)) {
		return args.cookieHeader;
	}
	return args.request?.headers.get("cookie") ?? args.cookieHeader;
}

/**
 * Site boundary. Reads the GitHub access token from better-auth's sealed
 * `account_data` cookie (stateless / no database).
 *
 * Async on purpose: sealed-cookie decrypt uses Web Crypto via better-auth.
 * The arena sketch was sync (`GithubUserToken | undefined`); this Result-
 * returning Promise is the intentional public API for the site.
 *
 * `getAccessToken` is an optional test seam (defaults to `auth.api.getAccessToken`,
 * which refreshes an expired GitHub App User token from the account cookie).
 * The default call passes the incoming `Request` so better-auth can resolve
 * dynamic `baseURL` from the lab host (ADR-0038), with `asResponse: false`.
 * Passing `request` without that flag returns a `Response`. Cookie-only
 * headers are not enough. An empty extracted `cookie` header still reads
 * the Request.
 *
 * Cookies that are not a GitHub session or account cookie are `missing`,
 * not `error`, and `getAccessToken` is not called. better-auth throws
 * `UNAUTHORIZED` with an empty message when headers are present but no
 * session exists; without `account_data` that is also `missing` so
 * localhost `LAB_DEV_USER` can still fill in (ADR-0012). A 401 while
 * `account_data` is present, and decrypt / refresh failures, stay `error`.
 */
export async function githubUserTokenFromSession(args: {
	cookieHeader: string;
	getAccessToken?: AccessTokenFetcher;
	request?: Request;
}): Promise<GithubUserSessionResult> {
	const request = args.request ?? currentRequest();
	const cookieHeader = cookieHeaderForSession({
		cookieHeader: args.cookieHeader,
		request,
	});
	if (
		cookieHeader.trim() === "" ||
		!cookieHeaderHasBetterAuthSessionOrAccount(cookieHeader)
	) {
		return { kind: "missing" };
	}

	const fetchToken = args.getAccessToken ?? defaultGetAccessToken;

	try {
		const tokens = await fetchToken({
			body: { useAccountCookie: true },
			headers: new Headers({ cookie: cookieHeader }),
			...(request === undefined ? {} : { request }),
		});
		return githubUserSessionResultFromAccessToken({
			accessToken: tokens.accessToken,
		});
	} catch (error: unknown) {
		if (
			!cookieHeaderHasBetterAuthAccount(cookieHeader) &&
			isUnauthorizedSessionError(error)
		) {
			return { kind: "missing" };
		}
		const message = sessionErrorMessage(error);
		console.error("[hakasebot] githubUserTokenFromSession failed:", message);
		return { kind: "error", message };
	}
}
