import type {
	GithubAppSlug,
	GithubInstallationId,
	GithubUserToken,
	ParseResult,
	RepoId,
	RepoRef,
} from "#/domain.ts";

import { githubFetch } from "./http.server.ts";
import { installationsForApp, parseGithubRepoListField } from "./json.ts";

const PAGE_SIZE = 100;
const MAX_PAGES = 30;

async function listUserAppInstallations(args: {
	appSlug: GithubAppSlug;
	token: GithubUserToken;
}): Promise<
	ParseResult<{ accountLogin: string | undefined; id: GithubInstallationId }[]>
> {
	const response = await githubFetch({
		path: "/user/installations?per_page=100",
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return installationsForApp({
		appSlug: args.appSlug,
		json: response.json,
	});
}

export async function fetchUserAppInstallation(args: {
	accountLogin: string;
	appSlug: GithubAppSlug;
	token: GithubUserToken;
}): Promise<
	| { kind: "ok"; value: GithubInstallationId }
	| { kind: "missing" }
	| { kind: "invalid"; message: string }
> {
	const listed = await listUserAppInstallations({
		appSlug: args.appSlug,
		token: args.token,
	});
	if (listed.kind === "invalid") {
		return listed;
	}
	const wanted = args.accountLogin.trim().toLowerCase();
	const match = listed.value.find(
		(installation) => installation.accountLogin?.toLowerCase() === wanted,
	);
	if (match === undefined) {
		return { kind: "missing" };
	}
	return { kind: "ok", value: match.id };
}

export async function addRepoToUserInstallation(args: {
	installationId: GithubInstallationId;
	repoId: RepoId;
	token: GithubUserToken;
}): Promise<ParseResult<void>> {
	const response = await githubFetch({
		method: "PUT",
		path: `/user/installations/${args.installationId}/repositories/${args.repoId}`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return { kind: "ok", value: undefined };
}

async function listUserInstallationReposPage(args: {
	collected: RepoRef[];
	installationId: GithubInstallationId;
	page: number;
	token: GithubUserToken;
}): Promise<ParseResult<RepoRef[]>> {
	const params = new URLSearchParams({
		page: String(args.page),
		per_page: String(PAGE_SIZE),
	});
	const response = await githubFetch({
		path: `/user/installations/${args.installationId}/repositories?${params.toString()}`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const parsed = parseGithubRepoListField(
		response.json,
		"repositories",
		"installation repositories response is missing repositories",
	);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	const collected = [...args.collected, ...parsed.value.repos];
	if (parsed.value.pageLength < PAGE_SIZE || args.page >= MAX_PAGES) {
		return { kind: "ok", value: collected };
	}
	return listUserInstallationReposPage({
		collected,
		installationId: args.installationId,
		page: args.page + 1,
		token: args.token,
	});
}

export async function listUserAppGrantedRepos(args: {
	appSlug: GithubAppSlug;
	token: GithubUserToken;
}): Promise<ParseResult<RepoRef[]>> {
	const installations = await listUserAppInstallations({
		appSlug: args.appSlug,
		token: args.token,
	});
	if (installations.kind === "invalid") {
		return installations;
	}
	const listed = await Promise.all(
		installations.value.map(async (installation) =>
			listUserInstallationReposPage({
				collected: [],
				installationId: installation.id,
				page: 1,
				token: args.token,
			}),
		),
	);
	const repos: RepoRef[] = [];
	const seen = new Set<string>();
	for (const result of listed) {
		if (result.kind === "invalid") {
			return result;
		}
		for (const repo of result.value) {
			if (seen.has(repo.id)) {
				continue;
			}
			seen.add(repo.id);
			repos.push(repo);
		}
	}
	return { kind: "ok", value: repos };
}
