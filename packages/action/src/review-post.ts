import { inclusiveEnd } from "@hakasebot/core/domain.ts";
import type {
	CommentMarkdown,
	CommitSha,
	EngineKind,
	GithubReviewEvent,
	GithubToken,
	IdempotencyMarker,
	Job,
	ParseResult,
	PullNumber,
	ReviewMarkdown,
	ReviewReport,
	RunResult,
} from "@hakasebot/core/domain.ts";
import type { GithubReviewListItem } from "@hakasebot/core/github-api.server.ts";
import {
	createPullReview,
	dismissPullReview,
	listPullReviews,
} from "@hakasebot/core/github-api.server.ts";
import {
	findingToReviewComment,
	parseMarker,
	renderReviewBody,
} from "@hakasebot/core/review.server.ts";
import type { RunUrl } from "@hakasebot/core/wake/domain.ts";

import type { BotAuth } from "./github-auth.ts";
import { hashReviewBody } from "./review-hash.ts";

function renderedReview(args: {
	engine: EngineKind;
	notice?: CommentMarkdown;
	report: ReviewReport;
	runLink?: RunUrl;
	sha: CommitSha;
}) {
	const contentHash = hashReviewBody({
		report: args.report,
		...(args.notice === undefined ? {} : { notice: args.notice }),
	});
	const marker: IdempotencyMarker = {
		sha: args.sha,
		engine: args.engine,
		contentHash,
	};
	const body = renderReviewBody({
		marker,
		report: args.report,
		...(args.notice === undefined ? {} : { notice: args.notice }),
		...(args.runLink === undefined ? {} : { runLink: args.runLink }),
	});
	return { body, contentHash };
}

async function dismissSuperseded(args: {
	contentHash: IdempotencyMarker["contentHash"];
	pullNumber: PullNumber;
	repo: Job["repo"];
	reviews: readonly GithubReviewListItem[];
	token: GithubToken;
}): Promise<ParseResult<void>> {
	for (const review of args.reviews) {
		const parsed = parseMarker(review.body);
		if (parsed === undefined || parsed.contentHash === args.contentHash) {
			continue;
		}
		if (review.state === "DISMISSED") {
			continue;
		}
		// oxlint-disable-next-line eslint/no-await-in-loop -- GitHub write API: dismiss one at a time to avoid secondary rate limits
		const dismissed = await dismissPullReview({
			repo: args.repo,
			pullNumber: args.pullNumber,
			reviewId: review.id,
			token: args.token,
			message: "Superseded by a newer hakasebot review",
		});
		if (dismissed.kind === "invalid") {
			return dismissed;
		}
	}
	return { kind: "ok", value: undefined };
}

function reviewCommentPayloads(
	report: ReviewReport,
	runLink: RunUrl | undefined,
) {
	return report.findings.map((finding) => {
		const mapped = findingToReviewComment(finding, runLink);
		const endLine = inclusiveEnd(mapped.range);
		return {
			path: mapped.path,
			line: endLine,
			...(mapped.range.lineCount > 1 ? { startLine: mapped.range.start } : {}),
			body: mapped.body,
		};
	});
}

/** Skip when this sha already has an identical review; dismiss stale ones. */
async function reconcileExistingReviews(args: {
	contentHash: IdempotencyMarker["contentHash"];
	pullNumber: PullNumber;
	repo: Job["repo"];
	sha: CommitSha;
	token: GithubToken;
}): Promise<
	| { kind: "proceed" }
	| { kind: "failed"; message: string }
	| {
			kind: "skipped-unchanged";
			reviewId: GithubReviewListItem["id"];
			sha: CommitSha;
	  }
> {
	const listed = await listPullReviews({
		repo: args.repo,
		pullNumber: args.pullNumber,
		token: args.token,
	});
	if (listed.kind === "invalid") {
		return { kind: "failed", message: listed.message };
	}
	const reviews = listed.value.filter((review) => {
		const parsed = parseMarker(review.body);
		return parsed !== undefined && parsed.sha === args.sha;
	});
	const unchanged = reviews.find(
		(review) => parseMarker(review.body)?.contentHash === args.contentHash,
	);
	if (unchanged !== undefined) {
		return { kind: "skipped-unchanged", reviewId: unchanged.id, sha: args.sha };
	}
	const dismissed = await dismissSuperseded({
		contentHash: args.contentHash,
		pullNumber: args.pullNumber,
		repo: args.repo,
		reviews,
		token: args.token,
	});
	if (dismissed.kind === "invalid") {
		return { kind: "failed", message: dismissed.message };
	}
	return { kind: "proceed" };
}

async function postNewReview(args: {
	body: ReviewMarkdown;
	event: GithubReviewEvent;
	pullNumber: PullNumber;
	repo: Job["repo"];
	report: ReviewReport;
	runLink: RunUrl | undefined;
	sha: CommitSha;
	token: GithubToken;
}): Promise<RunResult> {
	const created = await createPullReview({
		repo: args.repo,
		pullNumber: args.pullNumber,
		token: args.token,
		sha: args.sha,
		event: args.event,
		body: args.body,
		comments: reviewCommentPayloads(args.report, args.runLink),
	});
	if (created.kind === "invalid") {
		return { kind: "failed", message: created.message };
	}
	return {
		kind: "posted",
		reviewId: created.value,
		sha: args.sha,
		findingCount: args.report.findings.length,
	};
}

/**
 * Idempotent post: skip when an identical review exists for this sha, dismiss
 * stale ones, then create the new GitHub review with inline comments.
 */
export async function reconcileAndPost(args: {
	auth: BotAuth;
	dryRun: boolean;
	engine: EngineKind;
	event: GithubReviewEvent;
	notice?: CommentMarkdown;
	pullNumber: PullNumber;
	repo: Job["repo"];
	report: ReviewReport;
	runLink?: RunUrl;
	sha: CommitSha;
}): Promise<RunResult> {
	const tokenResult = await args.auth.fresh();
	if (tokenResult.kind === "invalid") {
		return { kind: "failed", message: tokenResult.message };
	}
	const token = tokenResult.value;
	const { body, contentHash } = renderedReview(args);
	if (args.dryRun) {
		return { kind: "dry-run", sha: args.sha, report: args.report };
	}
	const reconciled = await reconcileExistingReviews({
		contentHash,
		pullNumber: args.pullNumber,
		repo: args.repo,
		sha: args.sha,
		token,
	});
	if (reconciled.kind !== "proceed") {
		return reconciled;
	}
	return postNewReview({
		body,
		event: args.event,
		pullNumber: args.pullNumber,
		repo: args.repo,
		report: args.report,
		runLink: args.runLink,
		sha: args.sha,
		token,
	});
}
