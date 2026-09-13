import { commitSha, reviewId } from "@hakasebot/core/domain.ts";
import type { GithubReviewListItem } from "@hakasebot/core/github-api.server.ts";
import { renderReviewBody } from "@hakasebot/core/review.server.ts";
import {
	must,
	sampleMergedReviewReport,
} from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import {
	findPriorHakaseReview,
	stripMarkerFromReviewBody,
} from "#/incremental-review.ts";
import { hashReviewBody } from "#/review-hash.ts";

const HEAD = must(commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
const PRIOR_SHA = must(commitSha("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));

test("stripMarkerFromReviewBody removes the hakase marker", () => {
	const body = `summary text\n\n<!-- hakasebot sha=abc engine=claude hash=def -->`;
	expect(stripMarkerFromReviewBody(body)).toBe("summary text");
});

test("findPriorHakaseReview picks a non-dismissed review on another sha", () => {
	const report = sampleMergedReviewReport("claude");
	const priorBody = renderReviewBody({
		marker: {
			contentHash: hashReviewBody({ report }),
			engine: "claude",
			sha: PRIOR_SHA,
		},
		report,
	});
	const reviews: GithubReviewListItem[] = [
		{
			body: priorBody,
			commitId: PRIOR_SHA,
			id: must(reviewId(9)),
			state: "COMMENTED",
			submittedAt: 1,
		},
	];
	const prior = findPriorHakaseReview({ currentSha: HEAD, reviews });
	expect(prior?.sinceSha).toBe(PRIOR_SHA);
	expect(prior?.priorBody).toContain("Standards");
});

test("findPriorHakaseReview picks the newest posted review", () => {
	const report = sampleMergedReviewReport("claude");
	const olderBody = renderReviewBody({
		marker: {
			contentHash: hashReviewBody({ report }),
			engine: "claude",
			sha: PRIOR_SHA,
		},
		report,
	});
	const newerSha = must(commitSha("cccccccccccccccccccccccccccccccccccccccc"));
	const newerBody = renderReviewBody({
		marker: {
			contentHash: hashReviewBody({ report }),
			engine: "claude",
			sha: newerSha,
		},
		report,
	});
	const prior = findPriorHakaseReview({
		currentSha: HEAD,
		reviews: [
			{
				body: newerBody,
				commitId: newerSha,
				id: must(reviewId(11)),
				state: "COMMENTED",
				submittedAt: 20,
			},
			{
				body: olderBody,
				commitId: PRIOR_SHA,
				id: must(reviewId(10)),
				state: "COMMENTED",
				submittedAt: 10,
			},
		],
	});
	expect(prior?.sinceSha).toBe(newerSha);
});

test("findPriorHakaseReview ignores dismissed and same-sha reviews", () => {
	const report = sampleMergedReviewReport("claude");
	const body = renderReviewBody({
		marker: {
			contentHash: hashReviewBody({ report }),
			engine: "claude",
			sha: HEAD,
		},
		report,
	});
	const sameShaReview = findPriorHakaseReview({
		currentSha: HEAD,
		reviews: [
			{
				body,
				commitId: HEAD,
				id: must(reviewId(1)),
				state: "COMMENTED",
				submittedAt: 1,
			},
		],
	});
	expect(sameShaReview).toBeUndefined();
	const dismissedReviews: GithubReviewListItem[] = [
		{
			body,
			commitId: PRIOR_SHA,
			id: must(reviewId(2)),
			state: "DISMISSED",
			submittedAt: 1,
		},
	];
	const dismissed = findPriorHakaseReview({
		currentSha: HEAD,
		reviews: dismissedReviews,
	});
	expect(dismissed).toBeUndefined();
});

test("findPriorHakaseReview keeps marker-only reviews for incremental diff", () => {
	const report = sampleMergedReviewReport("claude");
	const markerOnly = `<!-- hakasebot sha=${PRIOR_SHA} engine=claude hash=${hashReviewBody({ report })} -->`;
	const prior = findPriorHakaseReview({
		currentSha: HEAD,
		reviews: [
			{
				body: markerOnly,
				commitId: PRIOR_SHA,
				id: must(reviewId(12)),
				state: "COMMENTED",
				submittedAt: 1,
			},
		],
	});
	expect(prior?.sinceSha).toBe(PRIOR_SHA);
	expect(prior?.priorBody).toBe("");
});

test("findPriorHakaseReview ignores pending reviews", () => {
	const report = sampleMergedReviewReport("claude");
	const body = renderReviewBody({
		marker: {
			contentHash: hashReviewBody({ report }),
			engine: "claude",
			sha: PRIOR_SHA,
		},
		report,
	});
	const pending = findPriorHakaseReview({
		currentSha: HEAD,
		reviews: [
			{
				body,
				commitId: PRIOR_SHA,
				id: must(reviewId(3)),
				state: "PENDING",
				submittedAt: 99,
			},
		],
	});
	expect(pending).toBeUndefined();
});
