import { contentHash } from "@hakasebot/core/domain.ts";
import type {
	CommentMarkdown,
	ContentHash,
	ReviewReport,
} from "@hakasebot/core/domain.ts";

export function hashReviewBody(args: {
	notice?: CommentMarkdown;
	report: ReviewReport;
}): ContentHash {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(
		args.notice === undefined
			? JSON.stringify(args.report)
			: JSON.stringify({ notice: args.notice, report: args.report }),
	);
	const digest = hasher.digest("hex");
	const hashed = contentHash(digest);
	if (hashed.kind === "invalid") {
		throw new Error(hashed.message);
	}
	return hashed.value;
}

export function hashReport(report: ReviewReport): ContentHash {
	return hashReviewBody({ report });
}
