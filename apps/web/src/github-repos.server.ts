import type {
	GithubUserToken,
	ParseResult,
	RepoRef,
	RepoRefParts,
} from "@hakasebot/core/domain.ts";
import { githubFetch } from "@hakasebot/core/github-api.server.ts";
import {
	githubRepoRefSchema,
	parseGithubRepoList,
} from "@hakasebot/core/github-api/json.ts";
import { parseUnknown } from "@hakasebot/core/zod-parse.ts";

import { readUserSession, tokenFromUserSession } from "#/lib/user-session";
import { m as msg } from "#/paraglide/messages.js";

const PAGE_SIZE = 100;
const MAX_PAGES = 30;

function userReposPath(page: number): string {
	const params = new URLSearchParams({
		affiliation: "owner,collaborator,organization_member",
		page: String(page),
		per_page: String(PAGE_SIZE),
		sort: "updated",
	});
	return `/user/repos?${params.toString()}`;
}

async function listSessionReposPage(args: {
	collected: RepoRef[];
	page: number;
	token: GithubUserToken;
}): Promise<ParseResult<RepoRef[]>> {
	const response = await githubFetch({
		path: userReposPath(args.page),
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const parsed = parseGithubRepoList(
		response.json,
		msg.repos_response_not_array(),
	);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	const collected = [...args.collected, ...parsed.value.repos];
	if (parsed.value.pageLength < PAGE_SIZE || args.page >= MAX_PAGES) {
		return { kind: "ok", value: collected };
	}
	return listSessionReposPage({
		collected,
		page: args.page + 1,
		token: args.token,
	});
}

async function listSessionRepos(args: {
	token: GithubUserToken;
}): Promise<ParseResult<RepoRef[]>> {
	return listSessionReposPage({
		collected: [],
		page: 1,
		token: args.token,
	});
}

async function fetchNamedRepo(args: {
	parts: RepoRefParts;
	token: GithubUserToken;
}): Promise<ParseResult<RepoRef>> {
	const response = await githubFetch({
		path: `/repos/${args.parts.owner}/${args.parts.name}`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return parseUnknown(githubRepoRefSchema, response.json);
}

async function resolveNamedRepoForSession(args: {
	cookieHeader: string;
	parts: RepoRefParts;
}): Promise<ParseResult<RepoRef>> {
	const session = await readUserSession({ cookieHeader: args.cookieHeader });
	const token = tokenFromUserSession(session);
	if (token.kind === "invalid") {
		return token;
	}
	return fetchNamedRepo({ parts: args.parts, token: token.value });
}

export { fetchNamedRepo, listSessionRepos, resolveNamedRepoForSession };
