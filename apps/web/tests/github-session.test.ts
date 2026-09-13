import { expect, test, vi } from "vitest";

import { env } from "#/env.ts";
import { auth } from "#/lib/auth";
import {
	cookieHeaderHasBetterAuthSessionOrAccount,
	githubUserSessionResultFromAccessToken,
	githubUserTokenFromSession,
} from "#/lib/github-session";
import type { AccessTokenFetcher } from "#/lib/github-session";
import { githubUserTokenFromAccessToken } from "#/lib/github-user-token";
import { m as msg } from "#/paraglide/messages.js";

import {
	FAKE_ACCOUNT_COOKIE,
	FAKE_SESSION_COOKIE,
	betterAuthApiError,
} from "./session-fixture.ts";

test("githubUserTokenFromAccessToken brands a non-empty token", () => {
	const token = githubUserTokenFromAccessToken({
		accessToken: "ghu_test_token_value",
	});
	expect(token).toBe("ghu_test_token_value");
});

test("githubUserTokenFromAccessToken returns undefined for blank input", () => {
	expect(
		githubUserTokenFromAccessToken({ accessToken: undefined }),
	).toBeUndefined();
	expect(githubUserTokenFromAccessToken({ accessToken: "" })).toBeUndefined();
	expect(
		githubUserTokenFromAccessToken({ accessToken: "   " }),
	).toBeUndefined();
});

test("githubUserSessionResultFromAccessToken maps branded ok and missing", () => {
	expect(
		githubUserSessionResultFromAccessToken({
			accessToken: "ghu_session_token",
		}),
	).toEqual({ kind: "ok", token: "ghu_session_token" });
	expect(
		githubUserSessionResultFromAccessToken({ accessToken: undefined }),
	).toEqual({ kind: "missing" });
	expect(githubUserSessionResultFromAccessToken({ accessToken: "" })).toEqual({
		kind: "missing",
	});
});

test("cookieHeaderHasBetterAuthSessionOrAccount ignores stray and state cookies", () => {
	expect(cookieHeaderHasBetterAuthSessionOrAccount("")).toBe(false);
	expect(
		cookieHeaderHasBetterAuthSessionOrAccount("vite=1; mf-dispatch=x"),
	).toBe(false);
	expect(
		cookieHeaderHasBetterAuthSessionOrAccount("better-auth.state=abc"),
	).toBe(false);
	expect(cookieHeaderHasBetterAuthSessionOrAccount(FAKE_SESSION_COOKIE)).toBe(
		true,
	);
	expect(
		cookieHeaderHasBetterAuthSessionOrAccount(
			"__Secure-better-auth.account_data.0=chunk",
		),
	).toBe(true);
});

test("githubUserTokenFromSession returns missing for an empty cookie", async () => {
	await expect(
		githubUserTokenFromSession({ cookieHeader: "" }),
	).resolves.toEqual({ kind: "missing" });
	await expect(
		githubUserTokenFromSession({ cookieHeader: "   " }),
	).resolves.toEqual({ kind: "missing" });
});

test("githubUserTokenFromSession returns missing for cookies that are not a session", async () => {
	const getAccessToken = vi.fn();
	await expect(
		githubUserTokenFromSession({
			cookieHeader: "vite=1; better-auth.state=pending",
			getAccessToken,
		}),
	).resolves.toEqual({ kind: "missing" });
	expect(getAccessToken).not.toHaveBeenCalled();
});

test("githubUserTokenFromSession reads session cookies from the request when the extracted header is empty", async () => {
	const getAccessToken = vi.fn(
		async (args: Parameters<AccessTokenFetcher>[0]) => {
			expect(args.headers.get("cookie")).toBe(FAKE_SESSION_COOKIE);
			expect(args.headers.get("host")).toBeNull();
			expect(args.request?.headers.get("host")).toBe("hakase.talitha.tools");
			await Promise.resolve();
			return { accessToken: "ghu_from_request" };
		},
	);

	const result = await githubUserTokenFromSession({
		cookieHeader: "",
		getAccessToken,
		request: new Request("https://hakase.talitha.tools/", {
			headers: {
				cookie: FAKE_SESSION_COOKIE,
				host: "hakase.talitha.tools",
			},
		}),
	});

	expect(getAccessToken).toHaveBeenCalledTimes(1);
	expect(result).toEqual({
		kind: "ok",
		token: "ghu_from_request",
	});
});

test("githubUserTokenFromSession brands a token from a mocked getAccessToken", async () => {
	const getAccessToken = vi.fn(
		async (args: Parameters<AccessTokenFetcher>[0]) => {
			expect(args.body).toEqual({ useAccountCookie: true });
			expect(args.headers.get("cookie")).toBe(FAKE_SESSION_COOKIE);
			await Promise.resolve();
			return { accessToken: "ghu_mocked_access_token" };
		},
	);

	const result = await githubUserTokenFromSession({
		cookieHeader: FAKE_SESSION_COOKIE,
		getAccessToken,
	});

	expect(getAccessToken).toHaveBeenCalledTimes(1);
	const calledWith = getAccessToken.mock.calls[0]?.[0];
	expect(calledWith?.body).toEqual({ useAccountCookie: true });
	expect(calledWith?.headers).toBeInstanceOf(Headers);
	expect(result).toEqual({
		kind: "ok",
		token: "ghu_mocked_access_token",
	});
});

test("githubUserTokenFromSession returns missing when mock yields a blank token", async () => {
	const result = await githubUserTokenFromSession({
		cookieHeader: FAKE_SESSION_COOKIE,
		getAccessToken: async () => {
			await Promise.resolve();
			return { accessToken: "" };
		},
	});
	expect(result).toEqual({ kind: "missing" });
});

test("githubUserTokenFromSession returns missing for better-auth UNAUTHORIZED without account_data", async () => {
	const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
		/* should not log a missing session */
	});
	const result = await githubUserTokenFromSession({
		cookieHeader: FAKE_SESSION_COOKIE,
		getAccessToken: () => {
			throw betterAuthApiError({
				status: "UNAUTHORIZED",
				statusCode: 401,
			});
		},
	});
	expect(result).toEqual({ kind: "missing" });
	expect(errorSpy).not.toHaveBeenCalled();
	errorSpy.mockRestore();
});

test("githubUserTokenFromSession returns error for UNAUTHORIZED with account_data", async () => {
	const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
		/* silence expected failure log */
	});
	const result = await githubUserTokenFromSession({
		cookieHeader: FAKE_ACCOUNT_COOKIE,
		getAccessToken: () => {
			throw betterAuthApiError({
				status: "UNAUTHORIZED",
				statusCode: 401,
			});
		},
	});
	expect(result).toEqual({
		kind: "error",
		message: "UNAUTHORIZED",
	});
	expect(errorSpy).toHaveBeenCalled();
	errorSpy.mockRestore();
});

test("githubUserTokenFromSession returns error when getAccessToken throws", async () => {
	const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
		/* silence expected failure log */
	});

	const result = await githubUserTokenFromSession({
		cookieHeader: FAKE_ACCOUNT_COOKIE,
		getAccessToken: () => {
			throw new Error("account cookie decrypt failed");
		},
	});

	expect(result).toEqual({
		kind: "error",
		message: "account cookie decrypt failed",
	});
	expect(errorSpy).toHaveBeenCalled();
	errorSpy.mockRestore();
});

test("githubUserTokenFromSession names an empty APIError from its status", async () => {
	const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
		/* silence expected failure log */
	});
	const result = await githubUserTokenFromSession({
		cookieHeader: FAKE_ACCOUNT_COOKIE,
		getAccessToken: () => {
			throw betterAuthApiError({
				status: "BAD_REQUEST",
				statusCode: 400,
			});
		},
	});
	expect(result).toEqual({
		kind: "error",
		message: "BAD_REQUEST",
	});
	expect(errorSpy).toHaveBeenCalled();
	errorSpy.mockRestore();
});

test("githubUserTokenFromSession names an empty Error without status", async () => {
	const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
		/* silence expected failure log */
	});
	const empty = new Error("placeholder");
	empty.message = "";
	const result = await githubUserTokenFromSession({
		cookieHeader: FAKE_SESSION_COOKIE,
		getAccessToken: () => {
			throw empty;
		},
	});
	expect(result).toEqual({
		kind: "error",
		message: msg.github_session_read_failed(),
	});
	expect(errorSpy).toHaveBeenCalled();
	errorSpy.mockRestore();
});

test("githubUserTokenFromSession does not fail dynamic baseURL when the request has the lab host", async () => {
	const lab = new URL(env.VITE_LAB_URL);
	await expect(
		githubUserTokenFromSession({
			cookieHeader: FAKE_SESSION_COOKIE,
			request: new Request(lab.origin, {
				headers: {
					cookie: FAKE_SESSION_COOKIE,
					host: lab.host,
				},
			}),
		}),
	).resolves.toEqual({ kind: "missing" });
});

test("githubUserTokenFromSession reads a User token through default getAccessToken when a request is present", async () => {
	const spy = vi.spyOn(auth.api, "getAccessToken").mockResolvedValue({
		accessToken: "ghu_live",
		accessTokenExpiresAt: undefined,
		idToken: undefined,
		scopes: [],
	});

	try {
		await expect(
			githubUserTokenFromSession({
				cookieHeader: FAKE_ACCOUNT_COOKIE,
				request: new Request("http://localhost:47821/_serverFn/gate", {
					headers: {
						cookie: FAKE_ACCOUNT_COOKIE,
						host: "localhost:47821",
					},
					method: "POST",
				}),
			}),
		).resolves.toEqual({ kind: "ok", token: "ghu_live" });
		expect(spy).toHaveBeenCalledWith(
			expect.objectContaining({ asResponse: false }),
		);
	} finally {
		spy.mockRestore();
	}
});
