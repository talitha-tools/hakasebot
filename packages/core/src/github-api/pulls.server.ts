import { commitSha } from "#/domain.ts";
import type {
	CommentId,
	CommitSha,
	GithubUserToken,
	GithubToken,
	ParseResult,
	PullNumber,
	RepoRef,
	ReviewId,
} from "#/domain.ts";
import { keepParsed, parseUnknown, parseUnknownArray } from "#/zod-parse.ts";

import { githubFetch } from "./http.server.ts";
import {
	githubCommentBodySchema,
	githubReviewIdSchema,
	pullFileSchema,
	pullHeadShaSchema,
	pullHtmlUrlSchema,
	pullReviewItemSchema,
} from "./json.ts";
import type { GithubReviewListItem, PullFile } from "./json.ts";

const PULL_FILES_PAGE_SIZE = 100;
const PULL_FILES_MAX_PAGES = 30;

export async function fetchPullHeadSha(args: {
	repo: RepoRef;
	pullNumber: PullNumber;
	token: GithubToken;
}): Promise<ParseResult<CommitSha>> {
	const response = await githubFetch({
		token: args.token,
		path: `/repos/${args.repo.owner}/${args.repo.name}/pulls/${String(args.pullNumber)}`,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const parsed = parseUnknown(pullHeadShaSchema, response.json);
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return commitSha(parsed.value.head.sha);
}

export async function listPullFiles(args: {
	repo: RepoRef;
	pullNumber: PullNumber;
	token: GithubToken;
}): Promise<ParseResult<readonly PullFile[]>> {
	const files: PullFile[] = [];
	for (let page = 1; page <= PULL_FILES_MAX_PAGES; page += 1) {
		// oxlint-disable-next-line eslint/no-await-in-loop -- pagination stops based on each page's result
		const response = await githubFetch({
			token: args.token,
			path: `/repos/${args.repo.owner}/${args.repo.name}/pulls/${String(args.pullNumber)}/files?per_page=${String(PULL_FILES_PAGE_SIZE)}&page=${String(page)}`,
		});
		if (response.kind === "error") {
			return { kind: "invalid", message: response.message };
		}
		const listed = parseUnknownArray(
			response.json,
			"pull files response is not an array",
		);
		if (listed.kind === "invalid") {
			return listed;
		}
		if (listed.value.length === 0) {
			break;
		}
		files.push(...keepParsed(pullFileSchema, listed.value));
		if (listed.value.length < PULL_FILES_PAGE_SIZE) {
			break;
		}
	}
	return { kind: "ok", value: files };
}

export async function listPullReviews(args: {
	repo: RepoRef;
	pullNumber: PullNumber;
	token: GithubToken;
}): Promise<ParseResult<GithubReviewListItem[]>> {
	const reviews: GithubReviewListItem[] = [];
	for (let page = 1; page <= PULL_FILES_MAX_PAGES; page += 1) {
		// oxlint-disable-next-line eslint/no-await-in-loop -- pagination stops based on each page's result
		const response = await githubFetch({
			token: args.token,
			path: `/repos/${args.repo.owner}/${args.repo.name}/pulls/${String(args.pullNumber)}/reviews?per_page=${String(PULL_FILES_PAGE_SIZE)}&page=${String(page)}`,
		});
		if (response.kind === "error") {
			return { kind: "invalid", message: response.message };
		}
		const listed = parseUnknownArray(
			response.json,
			"reviews response is not an array",
		);
		if (listed.kind === "invalid") {
			return listed;
		}
		if (listed.value.length === 0) {
			break;
		}
		reviews.push(...keepParsed(pullReviewItemSchema, listed.value));
		if (listed.value.length < PULL_FILES_PAGE_SIZE) {
			break;
		}
	}
	return { kind: "ok", value: reviews };
}

export async function dismissPullReview(args: {
	repo: RepoRef;
	pullNumber: PullNumber;
	reviewId: ReviewId;
	token: GithubToken;
	message: string;
}): Promise<ParseResult<undefined>> {
	const response = await githubFetch({
		token: args.token,
		path: `/repos/${args.repo.owner}/${args.repo.name}/pulls/${String(args.pullNumber)}/reviews/${String(args.reviewId)}/dismissals`,
		method: "PUT",
		body: { message: args.message },
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	return { kind: "ok", value: undefined };
}

export async function createPullReview(args: {
	repo: RepoRef;
	pullNumber: PullNumber;
	token: GithubToken;
	sha: CommitSha;
	event: "COMMENT" | "REQUEST_CHANGES" | "APPROVE";
	body: string;
	comments: {
		path: string;
		line: number;
		startLine?: number;
		body: string;
	}[];
}): Promise<ParseResult<ReviewId>> {
	const response = await githubFetch({
		token: args.token,
		path: `/repos/${args.repo.owner}/${args.repo.name}/pulls/${String(args.pullNumber)}/reviews`,
		method: "POST",
		body: {
			commit_id: args.sha,
			event: args.event,
			body: args.body,
			comments: args.comments.map((comment) => ({
				path: comment.path,
				line: comment.line,
				...(comment.startLine === undefined
					? {}
					: {
							start_line: comment.startLine,
							side: "RIGHT",
							start_side: "RIGHT",
						}),
				body: comment.body,
			})),
		},
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const parsed = githubReviewIdSchema.safeParse(response.json);
	if (!parsed.success) {
		return { kind: "invalid", message: "create review response missing id" };
	}
	return { kind: "ok", value: parsed.data };
}

export async function fetchCommentBody(args: {
	repo: RepoRef;
	commentId: CommentId;
	token: GithubToken;
}): Promise<ParseResult<string>> {
	const reviewComment = await githubFetch({
		token: args.token,
		path: `/repos/${args.repo.owner}/${args.repo.name}/pulls/comments/${String(args.commentId)}`,
	});
	const reviewBody = githubCommentBodySchema.safeParse(
		reviewComment.kind === "ok" ? reviewComment.json : undefined,
	);
	if (reviewBody.success) {
		return { kind: "ok", value: reviewBody.data.body };
	}
	const issueComment = await githubFetch({
		token: args.token,
		path: `/repos/${args.repo.owner}/${args.repo.name}/issues/comments/${String(args.commentId)}`,
	});
	if (issueComment.kind === "error") {
		return { kind: "invalid", message: issueComment.message };
	}
	const parsed = parseUnknown(githubCommentBodySchema, issueComment.json);
	if (parsed.kind === "invalid") {
		return { kind: "invalid", message: "comment response missing body" };
	}
	return { kind: "ok", value: parsed.value.body };
}

export async function findOpenPullByHead(args: {
	head: string;
	repo: RepoRef;
	token: GithubToken | GithubUserToken;
}): Promise<ParseResult<{ htmlUrl: string } | undefined>> {
	const response = await githubFetch({
		token: args.token,
		path: `/repos/${args.repo.owner}/${args.repo.name}/pulls?head=${encodeURIComponent(args.head)}&state=open`,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const listed = parseUnknownArray(
		response.json,
		"pulls response is not an array",
	);
	if (listed.kind === "invalid") {
		return listed;
	}
	const [match] = keepParsed(pullHtmlUrlSchema, listed.value);
	return {
		kind: "ok",
		value: match === undefined ? undefined : { htmlUrl: match.html_url },
	};
}

export async function createRepoPull(args: {
	base: string;
	body: string;
	head: string;
	repo: RepoRef;
	title: string;
	token: GithubToken | GithubUserToken;
}): Promise<ParseResult<{ htmlUrl: string }>> {
	const response = await githubFetch({
		body: {
			base: args.base,
			body: args.body,
			head: args.head,
			title: args.title,
		},
		method: "POST",
		path: `/repos/${args.repo.owner}/${args.repo.name}/pulls`,
		token: args.token,
	});
	if (response.kind === "error") {
		return { kind: "invalid", message: response.message };
	}
	const parsed = parseUnknown(pullHtmlUrlSchema, response.json);
	if (parsed.kind === "invalid") {
		return {
			kind: "invalid",
			message: "create pull response missing html_url",
		};
	}
	return { kind: "ok", value: { htmlUrl: parsed.value.html_url } };
}
