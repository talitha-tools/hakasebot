import { expect, test } from "vitest";

import {
	DEV_USER_DEFAULT_NAME,
	DEV_USER_DEFAULT_USER_ID,
	DEV_USER_STUB_REPO,
	githubUserIdFromDevUser,
	isLoopbackHostname,
	parseDevUser,
	publicDevUser,
} from "#/lib/dev-user.ts";

test("parseDevUser is off when the flag is unset", () => {
	expect(parseDevUser({ enabled: undefined })).toEqual({ kind: "off" });
});

test("parseDevUser is off when the flag is not the string 1", () => {
	expect(parseDevUser({ enabled: "true" })).toEqual({ kind: "off" });
});

test("parseDevUser is off when the request host is not loopback", () => {
	expect(
		parseDevUser({
			enabled: "1",
			requestUrl: "https://lab.example",
		}),
	).toEqual({ kind: "off" });
});

test("parseDevUser is off when the request URL is missing", () => {
	expect(parseDevUser({ enabled: "1" })).toEqual({ kind: "off" });
});

test("parseDevUser is on for localhost with the flag", () => {
	expect(
		parseDevUser({
			enabled: "1",
			requestUrl: "http://localhost",
		}),
	).toEqual({
		github: { kind: "none" },
		githubUserId: DEV_USER_DEFAULT_USER_ID,
		githubUserIdSource: "default",
		kind: "on",
		name: DEV_USER_DEFAULT_NAME,
	});
});

test("parseDevUser is on for 127.0.0.1", () => {
	const parsed = parseDevUser({
		enabled: "1",
		requestUrl: "http://127.0.0.1:47821",
	});
	expect(parsed.kind).toBe("on");
});

test("parseDevUser brands an optional GitHub token", () => {
	expect(
		parseDevUser({
			enabled: "1",
			githubUserId: "42",
			name: "thea-dev",
			requestUrl: "http://localhost",
			token: "ghp_test_pat",
		}),
	).toEqual({
		github: { kind: "token", token: "ghp_test_pat" },
		githubUserId: "42",
		githubUserIdSource: "configured",
		kind: "on",
		name: "thea-dev",
	});
});

test("parseDevUser ignores a blank token", () => {
	const parsed = parseDevUser({
		enabled: "1",
		requestUrl: "http://localhost",
		token: "   ",
	});
	expect(parsed.kind).toBe("on");
	if (parsed.kind !== "on") {
		return;
	}
	expect(parsed.github).toEqual({ kind: "none" });
});

test("parseDevUser treats a blank github user id as default", () => {
	const parsed = parseDevUser({
		enabled: "1",
		githubUserId: "   ",
		requestUrl: "http://localhost",
	});
	expect(parsed.kind).toBe("on");
	if (parsed.kind !== "on") {
		return;
	}
	expect(parsed.githubUserId).toBe(DEV_USER_DEFAULT_USER_ID);
	expect(parsed.githubUserIdSource).toBe("default");
});

test("publicDevUser does not include a token", () => {
	expect(
		publicDevUser(
			parseDevUser({
				enabled: "1",
				requestUrl: "http://localhost",
				token: "ghp_secret",
			}),
		),
	).toEqual({ kind: "on", name: DEV_USER_DEFAULT_NAME });
	expect(JSON.stringify(publicDevUser({ kind: "off" }))).not.toMatch(
		/token|ghp_/iu,
	);
});

test("isLoopbackHostname accepts only localhost and 127.0.0.1", () => {
	expect(isLoopbackHostname("localhost")).toBe(true);
	expect(isLoopbackHostname("LOCALHOST")).toBe(true);
	expect(isLoopbackHostname("127.0.0.1")).toBe(true);
	expect(isLoopbackHostname("example.com")).toBe(false);
	expect(isLoopbackHostname("::1")).toBe(false);
});

test("stub repo id is a valid owner/name", () => {
	expect(DEV_USER_STUB_REPO).toBe("hakase-dev/lab-demo");
});

test("githubUserIdFromDevUser skips /user without a PAT", () => {
	const parsed = parseDevUser({
		enabled: "1",
		requestUrl: "http://localhost",
	});
	expect(parsed.kind).toBe("on");
	if (parsed.kind !== "on") {
		return;
	}
	expect(githubUserIdFromDevUser(parsed)).toEqual({
		githubUserId: DEV_USER_DEFAULT_USER_ID,
		kind: "known",
	});
});

test("githubUserIdFromDevUser skips /user when the id is configured", () => {
	const parsed = parseDevUser({
		enabled: "1",
		githubUserId: "99",
		requestUrl: "http://localhost",
		token: "ghp_test_pat",
	});
	expect(parsed.kind).toBe("on");
	if (parsed.kind !== "on") {
		return;
	}
	expect(githubUserIdFromDevUser(parsed)).toEqual({
		githubUserId: "99",
		kind: "known",
	});
});

test("githubUserIdFromDevUser fetches /user for a PAT with the default id", () => {
	const parsed = parseDevUser({
		enabled: "1",
		requestUrl: "http://localhost",
		token: "ghp_test_pat",
	});
	expect(parsed.kind).toBe("on");
	if (parsed.kind !== "on") {
		return;
	}
	expect(githubUserIdFromDevUser(parsed)).toEqual({ kind: "fetch" });
});
