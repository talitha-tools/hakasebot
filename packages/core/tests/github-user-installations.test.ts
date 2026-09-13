import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import {
	githubRepoJson,
	testRepoRef,
} from "@hakasebot/test-kit/helpers/repo.ts";
import { afterEach, expect, test } from "vitest";

import {
	githubAppInstallationId,
	githubAppSlug,
	githubUserToken,
} from "#/domain.ts";
import {
	addRepoToUserInstallation,
	fetchUserAppInstallation,
	listUserAppGrantedRepos,
} from "#/github-api.server.ts";

let restoreFetch: (() => void) | undefined;

afterEach(() => {
	restoreFetch?.();
	restoreFetch = undefined;
});

function testToken() {
	return must(githubUserToken("ghu_test"));
}

function testSlug() {
	return must(githubAppSlug("hakase-bot"));
}

test("fetchUserAppInstallation returns the matching app installation", async () => {
	restoreFetch = installGithubFetchMock({
		listUserInstallations: () => ({
			json: {
				installations: [
					{ account: { login: "acme" }, app_slug: "hakase-bot", id: 11 },
					{ oops: true },
					"nope",
					{ account: { login: "thea" }, app_slug: "hakase-bot", id: 55 },
					{ account: { login: "thea" }, app_slug: "other-bot", id: 9 },
				],
			},
		}),
	});
	const result = await fetchUserAppInstallation({
		accountLogin: "thea",
		appSlug: testSlug(),
		token: testToken(),
	});
	expect(result).toEqual({
		kind: "ok",
		value: must(githubAppInstallationId("55")),
	});
});

test("fetchUserAppInstallation is missing when the app is not installed", async () => {
	restoreFetch = installGithubFetchMock({
		listUserInstallations: () => ({
			json: {
				installations: [
					{ account: { login: "thea" }, app_slug: "other-bot", id: 11 },
				],
			},
		}),
	});
	const result = await fetchUserAppInstallation({
		accountLogin: "thea",
		appSlug: testSlug(),
		token: testToken(),
	});
	expect(result).toEqual({ kind: "missing" });
});

test("fetchUserAppInstallation is missing when only another account has the App", async () => {
	restoreFetch = installGithubFetchMock({
		listUserInstallations: () => ({
			json: {
				installations: [
					{ account: { login: "acme" }, app_slug: "hakase-bot", id: 11 },
				],
			},
		}),
	});
	const result = await fetchUserAppInstallation({
		accountLogin: "thea",
		appSlug: testSlug(),
		token: testToken(),
	});
	expect(result).toEqual({ kind: "missing" });
});

test("addRepoToUserInstallation puts the repo onto the installation", async () => {
	let added: { id: string; repoId: string } | undefined;
	restoreFetch = installGithubFetchMock({
		addUserInstallationRepo: (id, repoId) => {
			added = { id, repoId };
			return { json: {}, status: 204 };
		},
	});
	const result = await addRepoToUserInstallation({
		installationId: must(githubAppInstallationId("55")),
		repoId: testRepoRef("thea/house", 930_001).id,
		token: testToken(),
	});
	expect(result).toEqual({ kind: "ok", value: undefined });
	expect(added).toEqual({ id: "55", repoId: "930001" });
});

test("listUserAppGrantedRepos lists repos from matching installations", async () => {
	restoreFetch = installGithubFetchMock({
		listUserInstallations: () => ({
			json: {
				installations: [
					{ id: 55, app_slug: "hakase-bot" },
					{ id: 9, app_slug: "other-bot" },
				],
			},
		}),
		listUserInstallationRepos: (id) => {
			if (id === "55") {
				return {
					json: {
						repositories: [githubRepoJson("thea/house", 930_001)],
					},
				};
			}
			throw new Error(`unexpected installation ${id}`);
		},
	});
	const result = await listUserAppGrantedRepos({
		appSlug: testSlug(),
		token: testToken(),
	});
	expect(result).toEqual({
		kind: "ok",
		value: [testRepoRef("thea/house", 930_001)],
	});
});

test("listUserAppGrantedRepos pages past three full repo pages", async () => {
	const requested: string[] = [];
	restoreFetch = installGithubFetchMock({
		listUserInstallations: () => ({
			json: {
				installations: [{ app_slug: "hakase-bot", id: 55 }],
			},
		}),
		listUserInstallationRepos: (id, query) => {
			expect(id).toBe("55");
			const page = query.get("page") ?? "1";
			requested.push(page);
			const pageNumber = Number(page);
			const count = page === "4" ? 50 : 100;
			return {
				json: {
					repositories: Array.from({ length: count }, (_slot, index) => {
						const repoNumber = (pageNumber - 1) * 100 + index + 1;
						return githubRepoJson(
							`thea/r${String(repoNumber)}`,
							1_000_000 + repoNumber,
						);
					}),
				},
			};
		},
	});
	const result = await listUserAppGrantedRepos({
		appSlug: testSlug(),
		token: testToken(),
	});
	expect(requested).toEqual(["1", "2", "3", "4"]);
	expect(result.kind).toBe("ok");
	if (result.kind !== "ok") {
		return;
	}
	expect(result.value).toHaveLength(350);
	expect(result.value[0]).toEqual(testRepoRef("thea/r1", 1_000_001));
	expect(result.value[349]).toEqual(testRepoRef("thea/r350", 1_000_350));
});
