import { expect, test, vi } from "vitest";

import { parseDevUser } from "#/lib/dev-user.ts";
import {
	githubUserIdFromUserSession,
	githubUserIdFromProfile,
	loadDevUser,
	readUserSession,
	tokenFromUserSession,
} from "#/lib/user-session";
import { m as msg } from "#/paraglide/messages.js";

import {
	FAKE_ACCOUNT_COOKIE,
	FAKE_SESSION_COOKIE,
	betterAuthApiError,
} from "./session-fixture.ts";

const localhostOn = parseDevUser({
	enabled: "1",
	requestUrl: "http://localhost",
});

const localhostWithToken = parseDevUser({
	enabled: "1",
	requestUrl: "http://localhost",
	token: "ghp_dev_pat",
});

test("loadDevUser is off under vitest", () => {
	expect(loadDevUser()).toEqual({ kind: "off" });
});

test("readUserSession stays missing when the request host is not loopback", async () => {
	const productionHost = parseDevUser({
		enabled: "1",
		requestUrl: "https://lab.example",
	});
	expect(productionHost).toEqual({ kind: "off" });
	await expect(
		readUserSession({
			cookieHeader: "",
			devUser: productionHost,
		}),
	).resolves.toEqual({ kind: "missing" });
});

test("readUserSession is missing when the cookie is empty and fake user is off", async () => {
	await expect(
		readUserSession({
			cookieHeader: "",
			devUser: { kind: "off" },
		}),
	).resolves.toEqual({ kind: "missing" });
});

test("readUserSession uses the fake user when the cookie is empty", async () => {
	const session = await readUserSession({
		cookieHeader: "",
		devUser: localhostOn,
	});
	expect(session).toEqual({
		user: localhostOn,
		kind: "dev",
	});
});

test("readUserSession prefers a real OAuth cookie over the fake user", async () => {
	const session = await readUserSession({
		cookieHeader: FAKE_SESSION_COOKIE,
		devUser: localhostOn,
		getAccessToken: async () => {
			await Promise.resolve();
			return { accessToken: "gho_real" };
		},
	});
	expect(session).toEqual({ kind: "oauth", token: "gho_real" });
});

test("readUserSession uses the fake user when cookies are not a GitHub session", async () => {
	const getAccessToken = vi.fn();
	const session = await readUserSession({
		cookieHeader: "vite=1; better-auth.state=pending",
		devUser: localhostOn,
		getAccessToken,
	});
	expect(session).toEqual({
		user: localhostOn,
		kind: "dev",
	});
	expect(getAccessToken).not.toHaveBeenCalled();
});

test("readUserSession uses the fake user when better-auth has no session", async () => {
	const session = await readUserSession({
		cookieHeader: FAKE_SESSION_COOKIE,
		devUser: localhostOn,
		getAccessToken: () => {
			throw betterAuthApiError({
				status: "UNAUTHORIZED",
				statusCode: 401,
			});
		},
	});
	expect(session).toEqual({
		user: localhostOn,
		kind: "dev",
	});
});

test("readUserSession does not mask UNAUTHORIZED with account_data", async () => {
	const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
		/* silence expected failure log */
	});
	const session = await readUserSession({
		cookieHeader: FAKE_ACCOUNT_COOKIE,
		devUser: localhostOn,
		getAccessToken: () => {
			throw betterAuthApiError({
				status: "UNAUTHORIZED",
				statusCode: 401,
			});
		},
	});
	expect(session).toEqual({
		kind: "error",
		message: "UNAUTHORIZED",
	});
	errorSpy.mockRestore();
});

test("readUserSession does not mask a decrypt error with the fake user", async () => {
	const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
		/* silence expected failure log */
	});
	const session = await readUserSession({
		cookieHeader: FAKE_ACCOUNT_COOKIE,
		devUser: localhostOn,
		getAccessToken: () => {
			throw new Error("account cookie decrypt failed");
		},
	});
	expect(session).toEqual({
		kind: "error",
		message: "account cookie decrypt failed",
	});
	errorSpy.mockRestore();
});

test("tokenFromUserSession requires a PAT on the fake user", () => {
	expect(localhostOn.kind).toBe("on");
	expect(localhostWithToken.kind).toBe("on");
	if (localhostOn.kind !== "on" || localhostWithToken.kind !== "on") {
		return;
	}
	expect(
		tokenFromUserSession({
			user: localhostOn,
			kind: "dev",
		}),
	).toEqual({ kind: "invalid", message: msg.dev_user_token_required() });
	expect(
		tokenFromUserSession({
			user: localhostWithToken,
			kind: "dev",
		}),
	).toEqual({ kind: "ok", value: "ghp_dev_pat" });
});

test("readUserSession brands a PAT on the fake user", async () => {
	const session = await readUserSession({
		cookieHeader: "",
		devUser: localhostWithToken,
	});
	expect(session.kind).toBe("dev");
	if (session.kind !== "dev") {
		return;
	}
	expect(tokenFromUserSession(session)).toEqual({
		kind: "ok",
		value: "ghp_dev_pat",
	});
});

test("githubUserIdFromProfile reads the numeric GitHub id", () => {
	expect(githubUserIdFromProfile({ id: 99, login: "thea" })).toEqual({
		kind: "ok",
		value: "99",
	});
});

test("githubUserIdFromProfile rejects a missing id", () => {
	expect(githubUserIdFromProfile({ login: "thea" })).toEqual({
		kind: "invalid",
		message: msg.github_user_id_missing(),
	});
});

test("githubUserIdFromProfile rejects a non-object profile", () => {
	expect(githubUserIdFromProfile("not-json")).toEqual({
		kind: "invalid",
		message: msg.github_user_not_object(),
	});
});

test("githubUserIdFromUserSession skips /user on the fake user without a PAT", async () => {
	const fetchGithubUser = vi.fn();
	const session = await readUserSession({
		cookieHeader: "",
		devUser: localhostOn,
	});
	expect(session.kind).toBe("dev");
	if (session.kind !== "dev") {
		return;
	}
	await expect(
		githubUserIdFromUserSession({ fetchGithubUser, session }),
	).resolves.toEqual({ kind: "ok", value: "1" });
	expect(fetchGithubUser).not.toHaveBeenCalled();
});

test("githubUserIdFromUserSession fetches /user for a PAT with the default id", async () => {
	const fetchGithubUser = vi.fn(async () => {
		await Promise.resolve();
		return { kind: "ok" as const, json: { id: 4242 } };
	});
	const session = await readUserSession({
		cookieHeader: "",
		devUser: localhostWithToken,
	});
	expect(session.kind).toBe("dev");
	if (session.kind !== "dev") {
		return;
	}
	await expect(
		githubUserIdFromUserSession({ fetchGithubUser, session }),
	).resolves.toEqual({ kind: "ok", value: "4242" });
	expect(fetchGithubUser).toHaveBeenCalledOnce();
});
