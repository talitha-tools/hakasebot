import type { EngineConfig, EngineKind } from "./engine.ts";
import type { Bot, GithubAppSlug } from "./github-app.ts";
import type { ParseResult } from "./parse.ts";
import {
	brandString,
	parseInvalid,
	parseOk,
	requireSingleLine,
	requireText,
} from "./parse.ts";
import type { CommitSha, RepoRef } from "./repo.ts";
import type {
	CommentId,
	PullNumber,
	ReviewEventChoice,
	ReviewId,
	ReviewReport,
} from "./review.ts";

export type TriggerPhrase = string & { readonly __brand: "TriggerPhrase" };
export type FixPhrase = string & { readonly __brand: "FixPhrase" };
export type WorkflowYaml = string & { readonly __brand: "WorkflowYaml" };
export type ContentHash = string & { readonly __brand: "ContentHash" };
export type ActionRef = string & { readonly __brand: "ActionRef" };

export const DEFAULT_FIX_PHRASE = "fix this";

export interface Phrases {
	trigger: TriggerPhrase;
	fix: FixPhrase;
}

export interface Job {
	repo: RepoRef;
	engine: EngineConfig;
	bot: Bot;
	reviewEvent: ReviewEventChoice;
	phrases: Phrases | undefined;
	failOnFindings: boolean;
	dryRun: boolean;
}

export type ParsedEvent =
	| { draft: boolean; kind: "pull_request"; pullNumber: PullNumber }
	| {
			kind: "issue_comment";
			pullNumber: PullNumber;
			commentId: CommentId;
			body: string;
	  }
	| {
			kind: "review_comment";
			pullNumber: PullNumber;
			commentId: CommentId;
			body: string;
	  };

export type Plan =
	| { kind: "review"; pullNumber: PullNumber }
	| { kind: "mention"; pullNumber: PullNumber; commentId: CommentId }
	| { kind: "fix"; pullNumber: PullNumber; commentId: CommentId };

export type PlanResult = { kind: "plan"; plan: Plan } | { kind: "no_match" };

export type Trigger = Plan;

export type IgnoreReason =
	| { kind: "not-a-pull-request" }
	| { kind: "no-phrase-match" }
	| { kind: "bot-actor" }
	| { kind: "unsupported-event"; eventName: string }
	| { kind: "unsupported-action"; action: string };

export type EventDecision =
	| { kind: "run"; event: ParsedEvent }
	| { kind: "ignore"; reason: IgnoreReason };

export interface IdempotencyMarker {
	sha: CommitSha;
	engine: EngineKind;
	contentHash: ContentHash;
}

export type RunResult =
	| {
			kind: "posted";
			reviewId: ReviewId;
			sha: CommitSha;
			findingCount: number;
	  }
	| { kind: "skipped-unchanged"; reviewId: ReviewId; sha: CommitSha }
	| { kind: "dry-run"; sha: CommitSha; report: ReviewReport }
	| { kind: "reseed"; engine: "codex" | "grok"; message: string }
	| { kind: "failed"; message: string };

const HASH_PATTERN = /^[0-9a-f]{64}$/u;

export function triggerPhrase(value: string): ParseResult<TriggerPhrase> {
	const parsed = requireSingleLine(value, "trigger_phrase");
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return parseOk(brandString(parsed.value, "TriggerPhrase"));
}

export function fixPhrase(value: string): ParseResult<FixPhrase> {
	const parsed = requireSingleLine(value, "fix_phrase");
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return parseOk(brandString(parsed.value, "FixPhrase"));
}

export function mentionTrigger(slug: GithubAppSlug): TriggerPhrase {
	const parsed = triggerPhrase(`@${slug}`);
	if (parsed.kind === "invalid") {
		throw new Error(parsed.message);
	}
	return parsed.value;
}

export function workflowYaml(value: string): WorkflowYaml {
	const parsed = requireText(value, "workflow yaml");
	if (parsed.kind === "invalid") {
		throw new RangeError(parsed.message);
	}
	return brandString(parsed.value, "WorkflowYaml");
}

export function contentHash(value: string): ParseResult<ContentHash> {
	if (!HASH_PATTERN.test(value)) {
		return parseInvalid("content hash must be 64 hex chars");
	}
	return parseOk(brandString(value, "ContentHash"));
}

export function actionRef(value: string): ParseResult<ActionRef> {
	const parsed = requireText(value, "action ref");
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return parseOk(brandString(parsed.value, "ActionRef"));
}
