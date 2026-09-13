import { asFetch } from "@hakasebot/test-kit/helpers/as-fetch.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { afterEach, expect, test } from "vitest";

import { githubToken } from "#/domain.ts";
import { githubFetch } from "#/github-api.server.ts";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
	restoreFetch?.();
	restoreFetch = undefined;
});

function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof URL) {
		return input.href;
	}
	return input.url;
}

function installFetchSpy(): { urls: string[] } {
	const urls: string[] = [];
	const previous = globalThis.fetch;
	globalThis.fetch = asFetch((input) => {
		urls.push(requestUrl(input));
		return Response.json({ ok: true });
	});
	restoreFetch = () => {
		globalThis.fetch = previous;
	};
	return { urls };
}

test("githubFetch rejects a relative path without fetching", async () => {
	const { urls } = installFetchSpy();
	const result = await githubFetch({
		path: "repos/acme/lab",
		token: must(githubToken("ghs_test")),
	});
	expect(result).toEqual({
		kind: "error",
		message: "github path is invalid",
		status: 400,
	});
	expect(urls).toEqual([]);
});

test("githubFetch rejects a path with /../ without fetching", async () => {
	const { urls } = installFetchSpy();
	const result = await githubFetch({
		path: "/repos/acme/../installation",
		token: must(githubToken("ghs_test")),
	});
	expect(result).toEqual({
		kind: "error",
		message: "github path is invalid",
		status: 400,
	});
	expect(urls).toEqual([]);
});

test("githubFetch rejects a path with /.. without fetching", async () => {
	const { urls } = installFetchSpy();
	const result = await githubFetch({
		path: "/repos/acme/lab/..",
		token: must(githubToken("ghs_test")),
	});
	expect(result).toEqual({
		kind: "error",
		message: "github path is invalid",
		status: 400,
	});
	expect(urls).toEqual([]);
});

test("githubFetch fetches an absolute github path", async () => {
	const { urls } = installFetchSpy();
	const result = await githubFetch({
		path: "/user",
		token: must(githubToken("ghs_test")),
	});
	expect(result).toEqual({ kind: "ok", json: { ok: true }, status: 200 });
	expect(urls).toEqual(["https://api.github.com/user"]);
});
