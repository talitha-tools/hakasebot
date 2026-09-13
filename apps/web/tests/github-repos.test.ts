import { githubUserToken } from "@hakasebot/core/domain.ts";
import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import {
	githubRepoJson,
	testRepoRef,
} from "@hakasebot/test-kit/helpers/repo.ts";
import { afterEach, expect, test } from "vitest";

import { fetchNamedRepo, listSessionRepos } from "#/github-repos.server.ts";
import { m as msg } from "#/paraglide/messages.js";

function testToken(value: string) {
	return must(githubUserToken(value));
}

let restoreFetch: (() => void) | undefined;

function fullNamePage(
	prefix: string,
	count: number,
	idStart = 1,
): { full_name: string; id: number }[] {
	const items: { full_name: string; id: number }[] = [];
	for (let index = 0; index < count; index += 1) {
		items.push({
			full_name: `${prefix}${String(index)}`,
			id: idStart + index,
		});
	}
	return items;
}

afterEach(() => {
	restoreFetch?.();
	restoreFetch = undefined;
});

test("listSessionRepos parses full_name into RepoRef", async () => {
	restoreFetch = installGithubFetchMock({
		listUserRepos: () => ({
			json: [
				githubRepoJson("talitha-tools/hakase", 100_001),
				{ full_name: "not-a-repo" },
				{ name: "missing-full-name" },
				githubRepoJson("friends/demo", 100_002),
			],
		}),
	});

	const result = await listSessionRepos({
		token: testToken("ghu_test"),
	});

	expect(result).toEqual({
		kind: "ok",
		value: [
			testRepoRef("talitha-tools/hakase", 100_001),
			testRepoRef("friends/demo", 100_002),
		],
	});
});

test("listSessionRepos follows pages until a short page", async () => {
	const seen: string[] = [];
	restoreFetch = installGithubFetchMock({
		listUserRepos: (query) => {
			const page = query.get("page");
			seen.push(page ?? "");
			if (page === "1") {
				return { json: fullNamePage("org/repo-", 100) };
			}
			return { json: [githubRepoJson("org/last", 101)] };
		},
	});

	const result = await listSessionRepos({
		token: testToken("ghu_test"),
	});

	expect(seen).toEqual(["1", "2"]);
	expect(result.kind).toBe("ok");
	if (result.kind !== "ok") {
		return;
	}
	expect(result.value).toHaveLength(101);
	expect(result.value[100]).toEqual(testRepoRef("org/last", 101));
});

test("listSessionRepos stops at thirty pages", async () => {
	const seen: string[] = [];
	restoreFetch = installGithubFetchMock({
		listUserRepos: (query) => {
			const page = query.get("page");
			seen.push(page ?? "");
			return { json: fullNamePage(`org/p${page ?? "x"}-`, 100) };
		},
	});

	const result = await listSessionRepos({
		token: testToken("ghu_test"),
	});

	expect(seen).toHaveLength(30);
	expect(seen[0]).toBe("1");
	expect(seen[29]).toBe("30");
	expect(result.kind).toBe("ok");
	if (result.kind !== "ok") {
		return;
	}
	expect(result.value).toHaveLength(3000);
});

test("listSessionRepos maps a GitHub error", async () => {
	restoreFetch = installGithubFetchMock({
		listUserRepos: () => ({
			status: 401,
			json: { message: "Bad credentials" },
		}),
	});

	await expect(
		listSessionRepos({ token: testToken("ghu_bad") }),
	).resolves.toEqual({ kind: "invalid", message: "Bad credentials" });
});

test("listSessionRepos rejects a non-array payload", async () => {
	restoreFetch = installGithubFetchMock({
		listUserRepos: () => ({ json: { message: "nope" } }),
	});

	await expect(
		listSessionRepos({ token: testToken("ghu_test") }),
	).resolves.toEqual({
		kind: "invalid",
		message: msg.repos_response_not_array(),
	});
});

test("fetchNamedRepo parses GET /repos/{owner}/{name}", async () => {
	const repo = testRepoRef("talitha-tools/demo", 100_003);
	restoreFetch = installGithubFetchMock({
		getRepo: (owner, name) => {
			expect(owner).toBe("talitha-tools");
			expect(name).toBe("demo");
			return { json: githubRepoJson("talitha-tools/demo", 100_003) };
		},
	});
	const result = await fetchNamedRepo({
		parts: repo,
		token: testToken("ghu_test"),
	});
	expect(result).toEqual({
		kind: "ok",
		value: repo,
	});
});
