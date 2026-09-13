import type {
	CommitSha,
	GithubToken,
	Job,
	ParseResult,
	Plan,
	PullNumber,
	Trigger,
} from "@hakasebot/core/domain.ts";
import {
	fetchCommentBody,
	fetchPullHeadSha,
	listPullReviews,
} from "@hakasebot/core/github-api.server.ts";

import { workspaceRoot } from "./action-env.ts";
import { fetchCommitForDiff, isCommitAncestor } from "./home/clone-consumer.ts";
import { findPriorHakaseReview } from "./incremental-review.ts";
import type { PriorReviewContext } from "./incremental-review.ts";

async function resolvePriorReview(args: {
	checkoutRoot: string;
	currentSha: CommitSha;
	plan: Plan;
	pullNumber: PullNumber;
	repo: Job["repo"];
	token: GithubToken;
}): Promise<PriorReviewContext | undefined> {
	if (args.plan.kind !== "review") {
		return undefined;
	}
	const listed = await listPullReviews({
		pullNumber: args.pullNumber,
		repo: args.repo,
		token: args.token,
	});
	if (listed.kind === "invalid") {
		// No prior context without review history; run a full merge-base review.
		return undefined;
	}
	const prior = findPriorHakaseReview({
		currentSha: args.currentSha,
		reviews: listed.value,
	});
	if (prior === undefined) {
		return undefined;
	}
	// Best effort: if the prior commit can't be fetched or is not an ancestor
	// (force-push, deleted, or missing history) fall back to a full merge-base
	// review per ADR-0022. A broken token would already have failed the clone,
	// which surfaces its error, so the discard is not masking an auth regression.
	const fetched = await fetchCommitForDiff({
		cwd: args.checkoutRoot,
		sha: prior.sinceSha,
		token: args.token,
	});
	if (fetched.kind === "invalid") {
		return undefined;
	}
	const ancestor = await isCommitAncestor({
		ancestor: prior.sinceSha,
		cwd: args.checkoutRoot,
		descendant: args.currentSha,
	});
	if (!ancestor) {
		// Force-push: ADR-0022 falls back to full merge-base diff.
		return undefined;
	}
	return prior;
}

async function commentBodyForPlan(args: {
	job: Job;
	plan: Plan;
	token: GithubToken;
}): Promise<string | undefined> {
	if (args.plan.kind === "review") {
		return undefined;
	}
	const fetched = await fetchCommentBody({
		repo: args.job.repo,
		commentId: args.plan.commentId,
		token: args.token,
	});
	if (fetched.kind === "invalid") {
		return undefined;
	}
	return fetched.value;
}

export interface ResolvedReviewContext {
	checkoutRoot: string;
	commentBody: string | undefined;
	priorReview: PriorReviewContext | undefined;
	sha: CommitSha;
}

/** Head sha, triggering comment body, and prior-review context for one run. */
export async function reviewContext(args: {
	job: Job;
	trigger: Trigger;
	token: GithubToken;
}): Promise<ParseResult<ResolvedReviewContext>> {
	const shaResult = await fetchPullHeadSha({
		repo: args.job.repo,
		pullNumber: args.trigger.pullNumber,
		token: args.token,
	});
	if (shaResult.kind === "invalid") {
		return shaResult;
	}
	const commentBody = await commentBodyForPlan({
		job: args.job,
		plan: args.trigger,
		token: args.token,
	});
	const checkoutRoot = workspaceRoot();
	const priorReview = await resolvePriorReview({
		checkoutRoot,
		currentSha: shaResult.value,
		plan: args.trigger,
		pullNumber: args.trigger.pullNumber,
		repo: args.job.repo,
		token: args.token,
	});
	return {
		kind: "ok",
		value: { checkoutRoot, commentBody, priorReview, sha: shaResult.value },
	};
}
