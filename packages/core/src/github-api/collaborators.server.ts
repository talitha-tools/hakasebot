import type {
	GithubUserToken,
	GithubToken,
	ParseResult,
	RepoRef,
} from "#/domain.ts";
import { jsonObjectSchema, parseUnknown } from "#/zod-parse.ts";

import { githubFetch } from "./http.server.ts";
import { githubLoginSchema, githubNonEmptyLoginSchema } from "./json.ts";

export async function fetchGithubLogin(args: {
	token: GithubUserToken;
}): Promise<ParseResult<string>> {
	const response = await githubFetch({
		path: "/user",
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const parsed = parseUnknown(githubLoginSchema, response.json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return { kind: "ok", value: parsed.value.login };
}

export type HolderRepoAccess =
	| { kind: "has-write" }
	| { kind: "no-access" }
	| { kind: "unknown" };

export async function fetchGithubLoginByUserId(args: {
	token: GithubUserToken | GithubToken;
	userId: string;
}): Promise<
	| { kind: "invalid"; message: string }
	| { kind: "missing" }
	| { kind: "ok"; value: string }
> {
	const response = await githubFetch({
		path: `/user/${args.userId}`,
		token: args.token,
	});
	if (response.kind === "error") {
		if (response.status === 404) {
			return { kind: "missing" };
		}
		return { kind: "invalid", message: response.message };
	}
	const parsed = parseUnknown(githubNonEmptyLoginSchema, response.json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return { kind: "ok", value: parsed.value.login };
}

export function holderRepoAccessFromPermission(
	permission: unknown,
): HolderRepoAccess {
	if (permission === "admin" || permission === "write") {
		return { kind: "has-write" };
	}
	if (
		permission === "read" ||
		permission === "triage" ||
		permission === "none"
	) {
		return { kind: "no-access" };
	}
	return { kind: "unknown" };
}

export async function fetchCollaboratorRepoAccess(args: {
	login: string;
	repo: RepoRef;
	token: GithubUserToken | GithubToken;
}): Promise<HolderRepoAccess> {
	const response = await githubFetch({
		path: `/repos/${args.repo.owner}/${args.repo.name}/collaborators/${encodeURIComponent(args.login)}/permission`,
		token: args.token,
	});
	if (response.kind === "error") {
		if (response.status === 404) {
			return { kind: "no-access" };
		}
		return { kind: "unknown" };
	}
	const parsed = jsonObjectSchema.safeParse(response.json);
	if (!parsed.success) {
		return { kind: "unknown" };
	}
	return holderRepoAccessFromPermission(parsed.data["permission"]);
}

export async function checkClaimHolderWriteAccess(args: {
	holderGithubUserId: string;
	repo: RepoRef;
	token: GithubUserToken | GithubToken;
}): Promise<HolderRepoAccess> {
	const login = await fetchGithubLoginByUserId({
		token: args.token,
		userId: args.holderGithubUserId,
	});
	if (login.kind === "missing") {
		return { kind: "no-access" };
	}
	if (login.kind === "invalid") {
		return { kind: "unknown" };
	}
	return fetchCollaboratorRepoAccess({
		login: login.value,
		repo: args.repo,
		token: args.token,
	});
}
