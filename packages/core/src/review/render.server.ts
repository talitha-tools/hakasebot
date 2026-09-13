import {
	commentMarkdown,
	commitSha,
	contentHash,
	engineKind,
	exhaustive,
	reviewMarkdown,
	suggestionMarkdown,
} from "#/domain.ts";
import type {
	CommentMarkdown,
	Finding,
	GithubReviewEvent,
	IdempotencyMarker,
	LineRange,
	RepoPath,
	ReplacementText,
	ReviewEventChoice,
	ReviewMarkdown,
	ReviewReport,
	RunResult,
	SuggestionMarkdown,
} from "#/domain.ts";
import {
	layoutPostedComment,
	runLinkOrFallback,
} from "#/posted-comment-layout.ts";
import type { RunUrl } from "#/wake/domain.ts";

const MARKER_PATTERN =
	/<!-- hakasebot sha=(?<sha>[0-9a-f]+) engine=(?<engine>[a-z]+) hash=(?<hash>[0-9a-f]+) -->/u;

function longestBacktickRun(text: string): number {
	let longest = 0;
	let current = 0;
	for (const char of text) {
		if (char === "`") {
			current += 1;
			if (current > longest) {
				longest = current;
			}
		} else {
			current = 0;
		}
	}
	return longest;
}

export function renderSuggestionFence(
	replacement: ReplacementText,
): SuggestionMarkdown {
	const ticks = Math.max(3, longestBacktickRun(replacement) + 1);
	const fence = "`".repeat(ticks);
	return suggestionMarkdown(`${fence}suggestion\n${replacement}\n${fence}`);
}

export function reviewBodyHeader(findingCount: number): string {
	if (findingCount === 0) {
		return "hehe all clear!! nothing to poke!! (◕‿◕✿)";
	}
	return "look look!! rundown below!! ✿";
}

export function noteCommentHeader(): string {
	return "hmm this line feels off!! peek!!";
}

export function patchCommentHeader(): string {
	return "hehe a little fix!! try this!!";
}

export function formatPostedComment(args: {
	header: string;
	body: string;
	runLink?: RunUrl;
}): string {
	return layoutPostedComment({
		prose: args.header,
		content: args.body,
		footer: runLinkOrFallback(args.runLink),
	});
}

export function findingToReviewComment(
	finding: Finding,
	runLink?: RunUrl,
): {
	path: RepoPath;
	range: LineRange;
	body: CommentMarkdown;
} {
	if (finding.kind === "note") {
		return {
			path: finding.path,
			range: finding.range,
			body: commentMarkdown(
				formatPostedComment({
					header: noteCommentHeader(),
					body: finding.body,
					...(runLink === undefined ? {} : { runLink }),
				}),
			),
		};
	}
	const fence = renderSuggestionFence(finding.suggestion.replacement);
	return {
		path: finding.path,
		range: finding.range,
		body: commentMarkdown(
			formatPostedComment({
				header: patchCommentHeader(),
				body: `${finding.body}\n\n${fence}`,
				...(runLink === undefined ? {} : { runLink }),
			}),
		),
	};
}

export function renderReviewBody(args: {
	marker: IdempotencyMarker;
	notice?: CommentMarkdown;
	report: ReviewReport;
	runLink?: RunUrl;
}): ReviewMarkdown {
	const marker = `<!-- hakasebot sha=${args.marker.sha} engine=${args.marker.engine} hash=${args.marker.contentHash} -->`;
	const summary =
		args.notice === undefined
			? args.report.summary
			: `${args.notice}\n\n${args.report.summary}`;
	const prose = formatPostedComment({
		header: reviewBodyHeader(args.report.findings.length),
		body: summary,
		...(args.runLink === undefined ? {} : { runLink: args.runLink }),
	});
	return reviewMarkdown(`${prose}\n\n${marker}\n`);
}

export function parseMarker(body: string): IdempotencyMarker | undefined {
	const match = MARKER_PATTERN.exec(body);
	if (match === null) {
		return undefined;
	}
	const { groups } = match;
	if (groups === undefined) {
		return undefined;
	}
	const shaRaw = groups["sha"];
	const engineRaw = groups["engine"];
	const hashRaw = groups["hash"];
	if (
		shaRaw === undefined ||
		engineRaw === undefined ||
		hashRaw === undefined
	) {
		return undefined;
	}
	const sha = commitSha(shaRaw);
	const engine = engineKind(engineRaw);
	const hash = contentHash(hashRaw);
	if (
		sha.kind === "invalid" ||
		engine.kind === "invalid" ||
		hash.kind === "invalid"
	) {
		return undefined;
	}
	return {
		sha: sha.value,
		engine: engine.value,
		contentHash: hash.value,
	};
}

export function decideReviewEvent(args: {
	requested: ReviewEventChoice;
	report: ReviewReport;
}): GithubReviewEvent {
	if (args.requested !== "auto") {
		return args.requested;
	}
	if (args.report.findings.length === 0) {
		return "COMMENT";
	}
	return "REQUEST_CHANGES";
}

export function actionExitCode(args: {
	result: RunResult;
	failOnFindings: boolean;
}): 0 | 1 {
	switch (args.result.kind) {
		case "failed":
		case "reseed": {
			return 1;
		}
		case "posted": {
			if (args.failOnFindings && args.result.findingCount > 0) {
				return 1;
			}
			return 0;
		}
		case "skipped-unchanged":
		case "dry-run": {
			return 0;
		}
		default: {
			return exhaustive(args.result);
		}
	}
}
