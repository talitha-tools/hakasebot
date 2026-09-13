import { githubUserToken } from "@hakasebot/core/domain.ts";
import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import {
	githubRepoJson,
	testRepoRef,
} from "@hakasebot/test-kit/helpers/repo.ts";
import { afterEach, expect, test } from "vitest";

import { parseDeploymentConfig } from "#/env.ts";
import { filterReposByQuery } from "#/lab/filter-repos.ts";
import { listReposForSession } from "#/lab/list-repos.server.ts";
import { DEV_USER_STUB_REPOS, parseDevUser } from "#/lib/dev-user.ts";
import { m as msg } from "#/paraglide/messages.js";
import { typedRepoFallback } from "#/web-app/views/use-repos-panel.ts";

import { FAKE_SESSION_COOKIE } from "./session-fixture.ts";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
	restoreFetch?.();
	restoreFetch = undefined;
});

function grantListedRepos(repos: { full_name: string; id: number }[]) {
	return installGithubFetchMock({
		listUserRepos: () => ({ json: repos }),
		listUserInstallations: () => ({
			json: { installations: [{ app_slug: "helper", id: 55 }] },
		}),
		listUserInstallationRepos: () => ({
			json: { repositories: repos },
		}),
	});
}

test("filterReposByQuery is a no-op for a blank needle", () => {
	const repos = [
		testRepoRef("talitha-tools/hakase", 100_001),
		testRepoRef("friends/demo", 100_002),
	];
	expect(filterReposByQuery({ query: "  ", repos })).toBe(repos);
});

test("filterReposByQuery matches owner or name case-insensitively", () => {
	const [hakase] = [testRepoRef("talitha-tools/hakase", 100_001)];
	const demo = testRepoRef("friends/demo", 100_002);
	const repos = [hakase, demo];
	expect(filterReposByQuery({ query: "Haka", repos })).toEqual([hakase]);
	expect(filterReposByQuery({ query: "FRIENDS/", repos })).toEqual([demo]);
	expect(filterReposByQuery({ query: "zzz", repos })).toEqual([]);
});

test("typedRepoFallback is owner/name when that repo is not in the list", () => {
	const repos = [testRepoRef("talitha-tools/hakase", 100_001)];
	expect(typedRepoFallback({ query: "friends/demo", repos })).toEqual({
		name: "demo",
		owner: "friends",
	});
	expect(typedRepoFallback({ query: "talitha-tools/hakase", repos })).toBe(
		undefined,
	);
	expect(typedRepoFallback({ query: "zzz", repos })).toBe(undefined);
});

test("listReposForSession throws when the cookie is missing", async () => {
	await expect(listReposForSession({ cookieHeader: "" })).rejects.toThrow(
		msg.session_expired(),
	);
});

test("listReposForSession lists via the session token hop", async () => {
	restoreFetch = grantListedRepos([
		githubRepoJson("talitha-tools/hakase", 100_001),
	]);

	const repos = await listReposForSession({
		cookieHeader: FAKE_SESSION_COOKIE,
		getAccessToken: async () => {
			await Promise.resolve();
			return { accessToken: must(githubUserToken("ghu_session")) };
		},
		hostedBotApp: { kind: "unset" },
	});

	expect(repos).toEqual([testRepoRef("talitha-tools/hakase", 100_001)]);
});

test("listReposForSession returns the stub repo when the fake user has no token", async () => {
	const repos = await listReposForSession({
		cookieHeader: "",
		devUser: parseDevUser({
			enabled: "1",
			requestUrl: "http://localhost",
		}),
	});
	expect(repos).toEqual([...DEV_USER_STUB_REPOS]);
});

test("listReposForSession lists via PAT when the fake user has a token", async () => {
	restoreFetch = grantListedRepos([githubRepoJson("friends/demo", 100_002)]);

	const repos = await listReposForSession({
		cookieHeader: "",
		devUser: parseDevUser({
			enabled: "1",
			requestUrl: "http://localhost",
			token: "ghp_dev_pat",
		}),
		hostedBotApp: { kind: "unset" },
	});

	expect(repos).toEqual([testRepoRef("friends/demo", 100_002)]);
});

test("listReposForSession lists granted repos when the Hosted bot App is configured", async () => {
	restoreFetch = grantListedRepos([
		githubRepoJson("talitha-tools/hakase", 100_001),
	]);
	const parsed = parseDeploymentConfig({
		hostedAppClientId: "Iv23test",
		hostedAppPrivateKey: TEST_APP_PRIVATE_KEY,
		hostedAppSlug: "helper",
	});
	if (parsed.kind !== "ok" || parsed.value.hostedBotApp.kind !== "configured") {
		throw new Error("expected a configured Hosted bot App");
	}

	const repos = await listReposForSession({
		cookieHeader: FAKE_SESSION_COOKIE,
		getAccessToken: async () => {
			await Promise.resolve();
			return { accessToken: must(githubUserToken("ghu_session")) };
		},
		hostedBotApp: parsed.value.hostedBotApp,
	});

	expect(repos).toEqual([testRepoRef("talitha-tools/hakase", 100_001)]);
});
