import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { afterEach, expect, test } from "vitest";

import { githubUserToken } from "#/domain.ts";
import {
	createUserRepo,
	ensurePublicRuntimeRepo,
} from "#/github-api.server.ts";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
	restoreFetch?.();
	restoreFetch = undefined;
});

function testToken(value: string) {
	return must(githubUserToken(value));
}

test("createUserRepo posts a public repo with GitHub features off", async () => {
	const repo = testRepoRef("thea/review-home", 950_001);
	let posted: unknown;
	restoreFetch = installGithubFetchMock({
		createUserRepo: (body) => {
			posted = body;
			return {
				json: {
					full_name: "thea/review-home",
					id: Number(repo.id),
				},
			};
		},
	});

	const result = await createUserRepo({
		name: "review-home",
		token: testToken("ghu_test"),
	});

	expect(result).toEqual({
		kind: "ok",
		value: repo,
	});
	expect(posted).toEqual({
		auto_init: true,
		has_discussions: false,
		has_downloads: false,
		has_issues: false,
		has_projects: false,
		has_wiki: false,
		name: "review-home",
		private: false,
	});
});

test("ensurePublicRuntimeRepo patches public with GitHub features off", async () => {
	const repo = testRepoRef("thea/review-home", 950_001);
	let patched: { body: unknown; name: string; owner: string } | undefined;
	restoreFetch = installGithubFetchMock({
		patchRepo: (owner, name, body) => {
			patched = { body, name, owner };
			return { json: { private: false } };
		},
	});

	const result = await ensurePublicRuntimeRepo({
		repo,
		token: testToken("ghu_test"),
	});

	expect(result).toEqual({ kind: "ok", value: undefined });
	expect(patched).toEqual({
		body: {
			has_discussions: false,
			has_issues: false,
			has_projects: false,
			has_pull_requests: false,
			has_wiki: false,
			private: false,
		},
		name: "review-home",
		owner: "thea",
	});
});
