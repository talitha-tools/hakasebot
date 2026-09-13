import { z } from "zod";

import { base64Encode, base64ToBytes } from "#/base64.ts";
import type {
	GithubUserToken,
	GithubToken,
	ParseResult,
	RepoRef,
} from "#/domain.ts";
import { firstParsed, jsonObjectSchema, parseUnknown } from "#/zod-parse.ts";

import { githubFetch } from "./http.server.ts";

const textDecoder = new TextDecoder();
const invalidContents = "contents response is invalid";
const missingWriteSha = "contents write response missing sha";
const invalidWrite = "contents write response is invalid";
const missingRefSha = "git ref response missing sha";

const shaObjectSchema = z.object({ sha: z.string() });

const repoContentsObjectSchema = z.object(
	{
		content: z.string({ error: invalidContents }),
		sha: z.string({ error: invalidContents }),
		type: z.unknown().optional(),
	},
	{ error: invalidContents },
);

const repoContentsSchema = repoContentsObjectSchema.transform((row, ctx) => {
	if (row.type === "dir") {
		ctx.addIssue({ code: "custom", message: invalidContents });
		return z.NEVER;
	}
	return { content: row.content, sha: row.sha };
});

const contentsWriteSchema = jsonObjectSchema.transform((row, ctx) => {
	const sha = firstParsed(shaObjectSchema, [row["content"], row["commit"]]);
	if (sha === undefined) {
		ctx.addIssue({ code: "custom", message: missingWriteSha });
		return z.NEVER;
	}
	return { sha: sha.sha };
});

const gitRefObjectSchema = z.object(
	{ sha: z.string({ error: missingRefSha }) },
	{ error: missingRefSha },
);

const gitRefSchema = z.object(
	{ object: gitRefObjectSchema },
	{ error: missingRefSha },
);

export async function fetchRepoContents(args: {
	path: string;
	ref: string;
	repo: RepoRef;
	token: GithubToken | GithubUserToken;
}): Promise<
	| { kind: "invalid"; message: string }
	| { kind: "missing" }
	| { kind: "ok"; sha: string; text: string }
> {
	const response = await githubFetch({
		token: args.token,
		path: `/repos/${args.repo.owner}/${args.repo.name}/contents/${args.path}?ref=${encodeURIComponent(args.ref)}`,
	});
	if (response.kind === "error") {
		if (response.status === 404) {
			return { kind: "missing" };
		}
		return { kind: "invalid", message: response.message };
	}
	const parsed = parseUnknown(repoContentsSchema, response.json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return {
		kind: "ok",
		sha: parsed.value.sha,
		text: textDecoder.decode(base64ToBytes(parsed.value.content)),
	};
}

export async function putRepoContents(args: {
	branch: string;
	content: string;
	message: string;
	path: string;
	repo: RepoRef;
	sha?: string;
	token: GithubToken | GithubUserToken;
}): Promise<ParseResult<{ sha: string }>> {
	const response = await githubFetch({
		body: {
			branch: args.branch,
			content: base64Encode(args.content),
			message: args.message,
			...(args.sha === undefined ? {} : { sha: args.sha }),
		},
		method: "PUT",
		path: `/repos/${args.repo.owner}/${args.repo.name}/contents/${args.path}`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const envelope = jsonObjectSchema.safeParse(response.json);
	if (!envelope.success) {
		return { kind: "invalid", message: invalidWrite };
	}
	return parseUnknown(contentsWriteSchema, envelope.data);
}

export async function deleteRepoContents(args: {
	branch: string;
	message: string;
	path: string;
	repo: RepoRef;
	sha: string;
	token: GithubToken | GithubUserToken;
}): Promise<ParseResult<void>> {
	const response = await githubFetch({
		body: {
			branch: args.branch,
			message: args.message,
			sha: args.sha,
		},
		method: "DELETE",
		path: `/repos/${args.repo.owner}/${args.repo.name}/contents/${args.path}`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return { kind: "ok", value: undefined };
}

export async function fetchGitRef(args: {
	ref: string;
	repo: RepoRef;
	token: GithubToken | GithubUserToken;
}): Promise<
	| { kind: "invalid"; message: string }
	| { kind: "missing" }
	| { kind: "ok"; sha: string }
> {
	const response = await githubFetch({
		token: args.token,
		path: `/repos/${args.repo.owner}/${args.repo.name}/git/ref/${args.ref}`,
	});
	if (response.kind === "error") {
		if (response.status === 404) {
			return { kind: "missing" };
		}
		return { kind: "invalid", message: response.message };
	}
	const parsed = parseUnknown(gitRefSchema, response.json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return { kind: "ok", sha: parsed.value.object.sha };
}

export async function createGitRef(args: {
	ref: string;
	repo: RepoRef;
	sha: string;
	token: GithubToken | GithubUserToken;
}): Promise<ParseResult<undefined>> {
	const response = await githubFetch({
		body: { ref: args.ref, sha: args.sha },
		method: "POST",
		path: `/repos/${args.repo.owner}/${args.repo.name}/git/refs`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return { kind: "ok", value: undefined };
}
