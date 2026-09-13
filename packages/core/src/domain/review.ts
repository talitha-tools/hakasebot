import type { ParseResult } from "./parse.ts";
import {
	brandNumber,
	brandString,
	parseInvalid,
	parseOk,
	requireText,
} from "./parse.ts";
import type { RepoPath } from "./repo.ts";

export type PullNumber = number & { readonly __brand: "PullNumber" };
export type CommentId = number & { readonly __brand: "CommentId" };
export type ReviewId = number & { readonly __brand: "ReviewId" };
export type LineNumber = number & { readonly __brand: "LineNumber" };
export type LineCount = number & { readonly __brand: "LineCount" };
export type CommentMarkdown = string & {
	readonly __brand: "CommentMarkdown";
};
export type ReplacementText = string & {
	readonly __brand: "ReplacementText";
};
export type SuggestionMarkdown = string & {
	readonly __brand: "SuggestionMarkdown";
};
export type ReviewMarkdown = string & { readonly __brand: "ReviewMarkdown" };

export type ReviewEventChoice =
	| "COMMENT"
	| "REQUEST_CHANGES"
	| "APPROVE"
	| "auto";
export type GithubReviewEvent = "COMMENT" | "REQUEST_CHANGES" | "APPROVE";

export interface LineRange {
	start: LineNumber;
	lineCount: LineCount;
}

export interface Suggestion {
	replacement: ReplacementText;
}

export type Finding =
	| {
			kind: "note";
			path: RepoPath;
			range: LineRange;
			body: CommentMarkdown;
	  }
	| {
			kind: "patch";
			path: RepoPath;
			range: LineRange;
			body: CommentMarkdown;
			suggestion: Suggestion;
	  };

export interface ReviewReport {
	summary: CommentMarkdown;
	findings: Finding[];
}

const REVIEW_EVENTS = [
	"COMMENT",
	"REQUEST_CHANGES",
	"APPROVE",
	"auto",
] as const satisfies readonly ReviewEventChoice[];

export function pullNumber(value: number): ParseResult<PullNumber> {
	if (!Number.isInteger(value) || value < 1) {
		return parseInvalid("pull number must be an integer >= 1");
	}
	return parseOk(brandNumber(value, "PullNumber"));
}

export function commentId(value: number): ParseResult<CommentId> {
	if (!Number.isInteger(value) || value < 1) {
		return parseInvalid("comment id must be an integer >= 1");
	}
	return parseOk(brandNumber(value, "CommentId"));
}

export function reviewId(value: number): ParseResult<ReviewId> {
	if (!Number.isInteger(value) || value < 1) {
		return parseInvalid("review id must be an integer >= 1");
	}
	return parseOk(brandNumber(value, "ReviewId"));
}

export function lineNumber(value: number): ParseResult<LineNumber> {
	if (!Number.isInteger(value) || value < 1) {
		return parseInvalid("line number must be an integer >= 1");
	}
	return parseOk(brandNumber(value, "LineNumber"));
}

export function lineCount(value: number): ParseResult<LineCount> {
	if (!Number.isInteger(value) || value < 1) {
		return parseInvalid("line count must be an integer >= 1");
	}
	return parseOk(brandNumber(value, "LineCount"));
}

export function lineRange(args: {
	start: LineNumber;
	lineCount: LineCount;
}): LineRange {
	return { start: args.start, lineCount: args.lineCount };
}

export function inclusiveEnd(range: LineRange): LineNumber {
	const end = lineNumber(range.start + range.lineCount - 1);
	if (end.kind === "invalid") {
		throw new Error(end.message);
	}
	return end.value;
}

export function reviewEventChoice(
	value: string,
): ParseResult<ReviewEventChoice> {
	for (const item of REVIEW_EVENTS) {
		if (item === value) {
			return parseOk(item);
		}
	}
	return parseInvalid("invalid review_event");
}

export function commentMarkdown(value: string): CommentMarkdown {
	const parsed = requireText(value, "comment markdown");
	if (parsed.kind === "invalid") {
		throw new RangeError(parsed.message);
	}
	return brandString(parsed.value, "CommentMarkdown");
}

export function replacementText(value: string): ReplacementText {
	const parsed = requireText(value, "replacement text");
	if (parsed.kind === "invalid") {
		throw new RangeError(parsed.message);
	}
	return brandString(parsed.value, "ReplacementText");
}

export function suggestionMarkdown(value: string): SuggestionMarkdown {
	const parsed = requireText(value, "suggestion markdown");
	if (parsed.kind === "invalid") {
		throw new RangeError(parsed.message);
	}
	return brandString(parsed.value, "SuggestionMarkdown");
}

export function reviewMarkdown(value: string): ReviewMarkdown {
	const parsed = requireText(value, "review markdown");
	if (parsed.kind === "invalid") {
		throw new RangeError(parsed.message);
	}
	return brandString(parsed.value, "ReviewMarkdown");
}
