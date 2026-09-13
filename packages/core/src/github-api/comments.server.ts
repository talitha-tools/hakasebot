import type {
	CommentId,
	GithubUserToken,
	GithubToken,
	ParseResult,
	PullNumber,
	RepoRef,
} from "#/domain.ts";
import { parseUnknownArray } from "#/zod-parse.ts";

import { githubFetch } from "./http.server.ts";
import { commentsFromGithubList, githubCommentIdSchema } from "./json.ts";

export async function createIssueComment(args: {
	body: string;
	pullNumber: PullNumber;
	repo: RepoRef;
	token: GithubToken | GithubUserToken;
}): Promise<ParseResult<CommentId>> {
	const response = await githubFetch({
		body: { body: args.body },
		method: "POST",
		path: `/repos/${args.repo.owner}/${args.repo.name}/issues/${String(args.pullNumber)}/comments`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const parsed = githubCommentIdSchema.safeParse(response.json);
	if (!parsed.success) {
		return { kind: "invalid", message: "create comment response missing id" };
	}
	return { kind: "ok", value: parsed.data };
}

export async function patchIssueComment(args: {
	body: string;
	commentId: CommentId;
	repo: RepoRef;
	token: GithubToken | GithubUserToken;
}): Promise<ParseResult<void>> {
	const response = await githubFetch({
		body: { body: args.body },
		method: "PATCH",
		path: `/repos/${args.repo.owner}/${args.repo.name}/issues/comments/${String(args.commentId)}`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return { kind: "ok", value: undefined };
}

export async function deleteIssueComment(args: {
	commentId: CommentId;
	repo: RepoRef;
	token: GithubToken | GithubUserToken;
}): Promise<ParseResult<void>> {
	const response = await githubFetch({
		method: "DELETE",
		path: `/repos/${args.repo.owner}/${args.repo.name}/issues/comments/${String(args.commentId)}`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return { kind: "ok", value: undefined };
}

export async function listIssueComments(args: {
	pullNumber: PullNumber;
	repo: RepoRef;
	token: GithubToken | GithubUserToken;
}): Promise<ParseResult<readonly { body: string; id: CommentId }[]>> {
	const response = await githubFetch({
		path: `/repos/${args.repo.owner}/${args.repo.name}/issues/${String(args.pullNumber)}/comments?per_page=100`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const listed = parseUnknownArray(response.json, "comments list is invalid");
	if (listed.kind === "invalid") {
		return listed;
	}
	return { kind: "ok", value: commentsFromGithubList(listed.value) };
}
