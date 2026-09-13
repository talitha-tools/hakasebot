import { z } from "zod";

import { parseRepoRef, repoRefFromApi } from "#/domain.ts";
import type {
	GithubUserToken,
	GithubToken,
	ParseResult,
	RepoRef,
	RepoRefParts,
} from "#/domain.ts";
import { jsonObjectSchema, parseUnknown } from "#/zod-parse.ts";

import { githubFetch } from "./http.server.ts";

const invalidPublicKey = "public key response is invalid";
const missingPermissions = "repository response missing permissions";
const missingDefaultBranch = "repository response missing default_branch";
const missingFullName = "create repo response missing full_name";

const repoPublicKeySchema = z
	.object(
		{
			key: z.string({ error: invalidPublicKey }),
			key_id: z.string({ error: invalidPublicKey }),
		},
		{ error: invalidPublicKey },
	)
	.transform((row) => ({ key: row.key, keyId: row.key_id }));

const repoPermissionsSchema = z.object(
	{
		permissions: jsonObjectSchema,
	},
	{ error: missingPermissions },
);

const repoDefaultBranchSchema = z.object(
	{
		default_branch: z
			.string({ error: missingDefaultBranch })
			.min(1, { error: missingDefaultBranch }),
	},
	{ error: missingDefaultBranch },
);

const createRepoObjectSchema = z.object(
	{
		full_name: z.string({ error: missingFullName }),
		id: z.number({ error: missingFullName }),
	},
	{ error: missingFullName },
);

export async function fetchRepoPublicKey(args: {
	repo: RepoRef;
	token: GithubUserToken;
}): Promise<ParseResult<{ keyId: string; key: string }>> {
	const response = await githubFetch({
		token: args.token,
		path: `/repos/${args.repo.owner}/${args.repo.name}/actions/secrets/public-key`,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return parseUnknown(repoPublicKeySchema, response.json);
}

export async function putRepoSecret(args: {
	repo: RepoRef;
	token: GithubUserToken;
	name: string;
	encryptedValue: string;
	keyId: string;
}): Promise<ParseResult<undefined>> {
	const response = await githubFetch({
		token: args.token,
		path: `/repos/${args.repo.owner}/${args.repo.name}/actions/secrets/${args.name}`,
		method: "PUT",
		body: {
			encrypted_value: args.encryptedValue,
			key_id: args.keyId,
		},
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return { kind: "ok", value: undefined };
}

export async function fetchRepoWriteAccess(args: {
	repo: RepoRef;
	token: GithubUserToken;
}): Promise<ParseResult<undefined>> {
	const response = await githubFetch({
		token: args.token,
		path: `/repos/${args.repo.owner}/${args.repo.name}`,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const parsed = parseUnknown(repoPermissionsSchema, response.json);
	if (parsed.kind === "invalid") {
		return { kind: "invalid", message: missingPermissions };
	}
	const { permissions } = parsed.value;
	if (permissions["push"] === true || permissions["admin"] === true) {
		return { kind: "ok", value: undefined };
	}
	return {
		kind: "invalid",
		message: "signed-in user cannot write this repository",
	};
}

export async function fetchRepoDefaultBranch(args: {
	repo: RepoRef;
	token: GithubToken | GithubUserToken;
}): Promise<ParseResult<string>> {
	const response = await githubFetch({
		token: args.token,
		path: `/repos/${args.repo.owner}/${args.repo.name}`,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const parsed = parseUnknown(repoDefaultBranchSchema, response.json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return { kind: "ok", value: parsed.value.default_branch };
}

export function repoFromFullName(fullName: string): ParseResult<RepoRefParts> {
	return parseRepoRef(fullName);
}

/** GitHub social features off on a public runtime-only repo. */
const PUBLIC_RUNTIME_REPO_FEATURES = {
	has_discussions: false,
	has_issues: false,
	has_projects: false,
	has_wiki: false,
} as const;

export async function createUserRepo(args: {
	name: string;
	token: GithubUserToken;
}): Promise<ParseResult<RepoRef>> {
	const response = await githubFetch({
		body: {
			auto_init: true,
			has_downloads: false,
			...PUBLIC_RUNTIME_REPO_FEATURES,
			name: args.name,
			private: false,
		},
		method: "POST",
		path: "/user/repos",
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const parsed = parseUnknown(createRepoObjectSchema, response.json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return repoRefFromApi(parsed.value);
}

export async function ensurePublicRuntimeRepo(args: {
	repo: RepoRef;
	token: GithubUserToken;
}): Promise<ParseResult<void>> {
	const response = await githubFetch({
		body: {
			...PUBLIC_RUNTIME_REPO_FEATURES,
			has_pull_requests: false,
			private: false,
		},
		method: "PATCH",
		path: `/repos/${args.repo.owner}/${args.repo.name}`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return { kind: "ok", value: undefined };
}
