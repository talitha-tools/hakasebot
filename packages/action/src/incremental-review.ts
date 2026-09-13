import type { CommitSha } from "@hakasebot/core/domain.ts";
import { commitSha } from "@hakasebot/core/domain.ts";
import type { GithubReviewListItem } from "@hakasebot/core/github-api.server.ts";
import { parseMarker } from "@hakasebot/core/review.server.ts";

interface PriorReviewContext {
	priorBody: string;
	sinceSha: CommitSha;
}

const POSTED_REVIEW_STATES = new Set([
	"APPROVED",
	"CHANGES_REQUESTED",
	"COMMENTED",
]);

function stripMarkerFromReviewBody(body: string): string {
	const pattern = /<!-- hakasebot[\s\S]*?-->/u;
	return body.replace(pattern, "").trim();
}

function findPriorHakaseReview(args: {
	currentSha: CommitSha;
	reviews: readonly GithubReviewListItem[];
}): PriorReviewContext | undefined {
	let latest: PriorReviewContext | undefined;
	let latestSubmittedAt = -1;
	for (const review of args.reviews) {
		if (review.state === "DISMISSED" || review.state === "PENDING") {
			continue;
		}
		if (!POSTED_REVIEW_STATES.has(review.state)) {
			continue;
		}
		const marker = parseMarker(review.body);
		if (marker === undefined) {
			continue;
		}
		if (marker.sha === args.currentSha) {
			continue;
		}
		const sinceSha = commitSha(review.commitId);
		if (sinceSha.kind === "invalid") {
			continue;
		}
		const priorBody = stripMarkerFromReviewBody(review.body);
		if (review.submittedAt <= latestSubmittedAt) {
			continue;
		}
		latestSubmittedAt = review.submittedAt;
		latest = { priorBody, sinceSha: sinceSha.value };
	}
	return latest;
}

export type { PriorReviewContext };
export { findPriorHakaseReview, stripMarkerFromReviewBody };
