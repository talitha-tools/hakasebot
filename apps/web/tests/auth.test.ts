import { expect, test } from "vitest";

import { env } from "#/env.ts";
import { auth, labAuthAllowedHosts } from "#/lib/auth.ts";

import { FAKE_SESSION_COOKIE } from "./session-fixture.ts";

const DYNAMIC_BASE_URL_ERROR =
	"Dynamic baseURL could not be resolved for this direct auth.api call";

function labOriginRequest(): Request {
	const lab = new URL(env.VITE_LAB_URL);
	return new Request(lab.origin, {
		headers: {
			cookie: FAKE_SESSION_COOKIE,
			host: lab.host,
		},
	});
}

function accessTokenErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

test("GitHub sign-in disables better-auth default classic scopes", () => {
	expect(auth.options.socialProviders.github.disableDefaultScope).toBe(true);
});

test("better-auth baseURL allowlists the public Lab origin", () => {
	expect(auth.options.baseURL).toEqual(
		labAuthAllowedHosts(env.VITE_LAB_URL, {
			includeLoopback: env.LAB_DEV_USER === "1",
		}),
	);
});

test("labAuthAllowedHosts pins a public origin to that host", () => {
	expect(labAuthAllowedHosts("https://lab.example")).toEqual({
		allowedHosts: ["lab.example"],
	});
});

test("labAuthAllowedHosts allows loopback hosts when the lab origin is loopback", () => {
	expect(labAuthAllowedHosts("http://localhost:47821")).toEqual({
		allowedHosts: [
			"localhost:47821",
			"localhost",
			"localhost:*",
			"127.0.0.1",
			"127.0.0.1:*",
		],
	});
});

test("labAuthAllowedHosts adds loopback when LAB_DEV_USER needs local vite", () => {
	expect(
		labAuthAllowedHosts("https://lab.example", { includeLoopback: true }),
	).toEqual({
		allowedHosts: [
			"lab.example",
			"localhost",
			"localhost:*",
			"127.0.0.1",
			"127.0.0.1:*",
		],
	});
});

test("auth.api.getAccessToken without a request host cannot resolve dynamic baseURL", async () => {
	await expect(
		auth.api.getAccessToken({
			body: { useAccountCookie: true },
			headers: new Headers({ cookie: FAKE_SESSION_COOKIE }),
		}),
	).rejects.toThrow(DYNAMIC_BASE_URL_ERROR);
});

test("auth.api.getAccessToken with the lab request does not fail dynamic baseURL", async () => {
	try {
		await auth.api.getAccessToken({
			body: { useAccountCookie: true },
			headers: new Headers({ cookie: FAKE_SESSION_COOKIE }),
			request: labOriginRequest(),
		});
	} catch (error: unknown) {
		expect(accessTokenErrorMessage(error)).not.toContain(
			DYNAMIC_BASE_URL_ERROR,
		);
	}
});

test("auth.api.getAccessToken returns a Response when given a request", async () => {
	const result = await auth.api.getAccessToken({
		body: { useAccountCookie: true },
		headers: new Headers({ cookie: FAKE_SESSION_COOKIE }),
		request: labOriginRequest(),
	});
	expect(result).toBeInstanceOf(Response);
});

test("auth.api.getAccessToken with asResponse false does not return a Response", async () => {
	try {
		const result = await auth.api.getAccessToken({
			asResponse: false,
			body: { useAccountCookie: true },
			headers: new Headers({ cookie: FAKE_SESSION_COOKIE }),
			request: labOriginRequest(),
		});
		expect(result).not.toBeInstanceOf(Response);
	} catch (error: unknown) {
		expect(error).not.toBeInstanceOf(Response);
		expect(accessTokenErrorMessage(error)).not.toContain(
			DYNAMIC_BASE_URL_ERROR,
		);
	}
});
