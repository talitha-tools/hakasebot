import {
	DEFAULT_FIX_PHRASE,
	commentId,
	exhaustive,
	fixPhrase,
	mentionTrigger,
	pullNumber,
} from "#/domain.ts";
import type {
	CommentId,
	EventDecision,
	GithubAppSlug,
	ParsedEvent,
	Phrases,
	PlanResult,
	PullNumber,
} from "#/domain.ts";
import { isRecord, readNumber, readString } from "#/is-record.ts";

export function defaultReviewPhrases(slug: GithubAppSlug): Phrases {
	const fix = fixPhrase(DEFAULT_FIX_PHRASE);
	if (fix.kind === "invalid") {
		throw new Error("default review phrases are invalid");
	}
	return { fix: fix.value, trigger: mentionTrigger(slug) };
}

const PR_ACTIONS = new Set([
	"opened",
	"synchronize",
	"reopened",
	"ready_for_review",
]);

function actorIsBot(payload: Record<string, unknown>): boolean {
	if (!isRecord(payload["sender"])) {
		return false;
	}
	return payload["sender"]["type"] === "Bot";
}

function parsePullRequestEvent(
	payload: Record<string, unknown>,
): EventDecision {
	const action = readString(payload["action"]);
	if (action === undefined || !PR_ACTIONS.has(action)) {
		return {
			kind: "ignore",
			reason: {
				kind: "unsupported-action",
				action: action ?? "missing",
			},
		};
	}
	if (!isRecord(payload["pull_request"])) {
		return { kind: "ignore", reason: { kind: "not-a-pull-request" } };
	}
	const number = pullNumber(readNumber(payload["pull_request"]["number"]) ?? 0);
	if (number.kind === "invalid") {
		return { kind: "ignore", reason: { kind: "not-a-pull-request" } };
	}
	return {
		kind: "run",
		event: {
			draft:
				action === "ready_for_review"
					? false
					: payload["pull_request"]["draft"] === true,
			kind: "pull_request",
			pullNumber: number.value,
		},
	};
}

function parseIssueCommentEvent(
	payload: Record<string, unknown>,
): EventDecision {
	if (!isRecord(payload["issue"]) || !isRecord(payload["comment"])) {
		return { kind: "ignore", reason: { kind: "not-a-pull-request" } };
	}
	if (!isRecord(payload["issue"]["pull_request"])) {
		return { kind: "ignore", reason: { kind: "not-a-pull-request" } };
	}
	const number = pullNumber(readNumber(payload["issue"]["number"]) ?? 0);
	const id = commentId(readNumber(payload["comment"]["id"]) ?? 0);
	const body = readString(payload["comment"]["body"]);
	if (
		number.kind === "invalid" ||
		id.kind === "invalid" ||
		body === undefined
	) {
		return { kind: "ignore", reason: { kind: "not-a-pull-request" } };
	}
	return {
		kind: "run",
		event: {
			kind: "issue_comment",
			pullNumber: number.value,
			commentId: id.value,
			body,
		},
	};
}

function parseReviewCommentEvent(
	payload: Record<string, unknown>,
): EventDecision {
	if (!isRecord(payload["pull_request"]) || !isRecord(payload["comment"])) {
		return { kind: "ignore", reason: { kind: "not-a-pull-request" } };
	}
	const number = pullNumber(readNumber(payload["pull_request"]["number"]) ?? 0);
	const id = commentId(readNumber(payload["comment"]["id"]) ?? 0);
	const body = readString(payload["comment"]["body"]);
	if (
		number.kind === "invalid" ||
		id.kind === "invalid" ||
		body === undefined
	) {
		return { kind: "ignore", reason: { kind: "not-a-pull-request" } };
	}
	return {
		kind: "run",
		event: {
			kind: "review_comment",
			pullNumber: number.value,
			commentId: id.value,
			body,
		},
	};
}

export function parseGithubEvent(args: {
	payload: unknown;
	eventName: string;
}): EventDecision {
	if (!isRecord(args.payload)) {
		return {
			kind: "ignore",
			reason: { kind: "unsupported-event", eventName: args.eventName },
		};
	}
	if (actorIsBot(args.payload)) {
		return { kind: "ignore", reason: { kind: "bot-actor" } };
	}
	if (args.eventName === "pull_request") {
		return parsePullRequestEvent(args.payload);
	}
	if (args.eventName === "issue_comment") {
		return parseIssueCommentEvent(args.payload);
	}
	if (args.eventName === "pull_request_review_comment") {
		return parseReviewCommentEvent(args.payload);
	}
	return {
		kind: "ignore",
		reason: { kind: "unsupported-event", eventName: args.eventName },
	};
}

function bodyMatchesPhrases(args: { body: string; phrases: Phrases }): {
	hasTrigger: boolean;
	hasFix: boolean;
} {
	return {
		hasTrigger: args.body.includes(args.phrases.trigger),
		hasFix: args.body.includes(args.phrases.fix),
	};
}

function planFromComment(args: {
	body: string;
	commentId: CommentId;
	/** Review comments may escalate a fix-phrase match to a fix plan. */
	fixEligible: boolean;
	phrases: Phrases;
	pullNumber: PullNumber;
}): PlanResult {
	const { hasTrigger, hasFix } = bodyMatchesPhrases({
		body: args.body,
		phrases: args.phrases,
	});
	if (!hasTrigger && !hasFix) {
		return { kind: "no_match" };
	}
	if (args.fixEligible && hasFix) {
		return {
			kind: "plan",
			plan: {
				kind: "fix",
				pullNumber: args.pullNumber,
				commentId: args.commentId,
			},
		};
	}
	return {
		kind: "plan",
		plan: {
			kind: "mention",
			pullNumber: args.pullNumber,
			commentId: args.commentId,
		},
	};
}

type PullRequestEvent = Extract<ParsedEvent, { kind: "pull_request" }>;
type CommentEvent = Exclude<ParsedEvent, { kind: "pull_request" }>;
type PlanFromTriggerArgs =
	| { event: PullRequestEvent }
	| { event: CommentEvent; phrases: Phrases };

function isPullRequestPlan(
	args: PlanFromTriggerArgs,
): args is { event: PullRequestEvent } {
	return args.event.kind === "pull_request";
}

export function planFromTrigger(args: PlanFromTriggerArgs): PlanResult {
	if (isPullRequestPlan(args)) {
		return {
			kind: "plan",
			plan: { kind: "review", pullNumber: args.event.pullNumber },
		};
	}
	const { event, phrases } = args;
	switch (event.kind) {
		case "issue_comment": {
			return planFromComment({
				body: event.body,
				commentId: event.commentId,
				fixEligible: false,
				phrases,
				pullNumber: event.pullNumber,
			});
		}
		case "review_comment": {
			return planFromComment({
				body: event.body,
				commentId: event.commentId,
				fixEligible: true,
				phrases,
				pullNumber: event.pullNumber,
			});
		}
		default: {
			return exhaustive(event);
		}
	}
}
