import { brandString } from "#/domain.ts";
import type {
	CommitSha,
	GithubInstallationId,
	ParsedEvent,
	Plan,
	RepoRef,
} from "#/domain.ts";

import type { AutoAuthorsCheck, PullAuthor } from "./auto-authors.ts";
import { autoWakeAllowsAuthor } from "./auto-authors.ts";
import type { AutoBranchesCheck } from "./auto-branches.ts";
import { autoWakeAllowsBranch } from "./auto-branches.ts";
import type { AutoReviewCadence, WakeMode } from "./repo-settings.ts";

export const AUTO_WAKE_BLOCKING_STATUSES = ["queued", "dispatched"] as const;
export type AutoWakeBlockingStatus =
	(typeof AUTO_WAKE_BLOCKING_STATUSES)[number];

export const AUTO_WAKE_RETRYABLE_STATUSES = [
	"cancelled",
	"failed",
	"superseded",
] as const;
export type AutoWakeRetryableStatus =
	(typeof AUTO_WAKE_RETRYABLE_STATUSES)[number];

export const WAKE_STATUSES = [
	...AUTO_WAKE_BLOCKING_STATUSES,
	...AUTO_WAKE_RETRYABLE_STATUSES,
] as const;
export type WakeStatus = (typeof WAKE_STATUSES)[number];

export type WakeKey = string & { readonly __brand: "WakeKey" };
export type DispatchId = string & { readonly __brand: "DispatchId" };
export type RunUrl = string & { readonly __brand: "RunUrl" };

export interface WakeEvent {
	author: PullAuthor | undefined;
	baseRef: string | undefined;
	consumer: RepoRef;
	defaultBranch: string | undefined;
	draft: boolean;
	headSha: CommitSha | undefined;
	installationId: GithubInstallationId;
	parsed: ParsedEvent;
}

export type WakeIgnoreReason =
	| { kind: "auto-authors" }
	| { kind: "auto-branches" }
	| { kind: "bad-signature" }
	| { kind: "draft" }
	| { kind: "home-missing" }
	| { kind: "mention-only" }
	| { kind: "no-model-slots" }
	| { kind: "no-plan" }
	| { kind: "repo-not-enabled" }
	| { kind: "unsupported" };

export type WakeDecision =
	| { kind: "dispatch"; plan: Plan; wakeKey: WakeKey }
	| { kind: "duplicate"; wakeKey: WakeKey }
	| { kind: "ignore"; reason: WakeIgnoreReason };

export type WakeOutcome =
	| { kind: "accepted"; dispatchId: DispatchId; runUrl: RunUrl | undefined }
	| { kind: "duplicate"; dispatchId: DispatchId }
	| {
			kind: "handled";
			lifecycle: "deleted" | "repositories-removed";
			releasedRepoCount: number;
	  }
	| { kind: "ignored"; reason: WakeIgnoreReason }
	| { kind: "rejected"; message: string }
	| { kind: "unavailable"; message: string };

export const WAKE_OUTCOME_KINDS = [
	"accepted",
	"duplicate",
	"handled",
	"ignored",
	"rejected",
	"unavailable",
] as const satisfies readonly WakeOutcome["kind"][];

export function parseWakeStatus(value: unknown): WakeStatus | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	for (const status of WAKE_STATUSES) {
		if (status === value) {
			return status;
		}
	}
	return undefined;
}

export function autoWakeCadenceBlocks(args: {
	cadence: AutoReviewCadence;
	priorStatus: WakeStatus | undefined;
}): boolean {
	if (args.cadence === "every-push" || args.priorStatus === undefined) {
		return false;
	}
	for (const status of AUTO_WAKE_BLOCKING_STATUSES) {
		if (status === args.priorStatus) {
			return true;
		}
	}
	return false;
}

export function autoWakeCadenceMayReplace(args: {
	cadence: AutoReviewCadence;
	priorStatus: WakeStatus | undefined;
}): boolean {
	if (args.cadence !== "once-per-pr" || args.priorStatus === undefined) {
		return false;
	}
	for (const status of AUTO_WAKE_RETRYABLE_STATUSES) {
		if (status === args.priorStatus) {
			return true;
		}
	}
	return false;
}

export function wakeKeyFor(args: {
	autoReviewCadence?: AutoReviewCadence;
	consumer: RepoRef;
	plan: Plan;
	headSha: CommitSha | undefined;
}): WakeKey {
	const repo = args.consumer.id;
	if (args.plan.kind === "review") {
		if (args.autoReviewCadence === "once-per-pr") {
			return brandString(`${repo}#${String(args.plan.pullNumber)}`, "WakeKey");
		}
		const sha = args.headSha ?? "unknown";
		return brandString(
			`${repo}#${String(args.plan.pullNumber)}@${sha}`,
			"WakeKey",
		);
	}
	return brandString(
		`${repo}#${String(args.plan.pullNumber)}!${String(args.plan.commentId)}`,
		"WakeKey",
	);
}

export function wakeWouldDispatch(route: {
	enabled: boolean;
	home: { installationId: GithubInstallationId; repo: RepoRef } | undefined;
}): boolean {
	return route.enabled && route.home !== undefined;
}

/** Gates that apply only to automatic review wakes, in decision order. */
function reviewWakeGate(args: {
	autoAuthorsCheck: AutoAuthorsCheck;
	autoBranchesCheck: AutoBranchesCheck;
	autoReviewCadence: AutoReviewCadence;
	draft: boolean;
	priorAutoWakeStatus: WakeStatus | undefined;
	wakeKey: WakeKey;
	wakeMode: WakeMode;
}): WakeDecision | undefined {
	if (args.draft) {
		return { kind: "ignore", reason: { kind: "draft" } };
	}
	if (args.wakeMode === "mention-only") {
		return { kind: "ignore", reason: { kind: "mention-only" } };
	}
	if (!autoWakeAllowsAuthor(args.autoAuthorsCheck)) {
		return { kind: "ignore", reason: { kind: "auto-authors" } };
	}
	if (
		autoWakeCadenceBlocks({
			cadence: args.autoReviewCadence,
			priorStatus: args.priorAutoWakeStatus,
		})
	) {
		return { kind: "duplicate", wakeKey: args.wakeKey };
	}
	if (!autoWakeAllowsBranch(args.autoBranchesCheck)) {
		return { kind: "ignore", reason: { kind: "auto-branches" } };
	}
	return undefined;
}

export function decideWake(args: {
	alreadyDispatched: boolean;
	autoAuthorsCheck: AutoAuthorsCheck;
	autoReviewCadence: AutoReviewCadence;
	autoBranchesCheck: AutoBranchesCheck;
	draft: boolean;
	enabled: boolean;
	homePresent: boolean;
	plan: Plan | undefined;
	priorAutoWakeStatus: WakeStatus | undefined;
	wakeMode: WakeMode;
	wakeKey: WakeKey;
}): WakeDecision {
	if (!args.enabled) {
		return { kind: "ignore", reason: { kind: "repo-not-enabled" } };
	}
	if (!args.homePresent) {
		return { kind: "ignore", reason: { kind: "home-missing" } };
	}
	if (args.plan === undefined) {
		return { kind: "ignore", reason: { kind: "no-plan" } };
	}
	if (args.plan.kind === "review") {
		const gate = reviewWakeGate(args);
		if (gate !== undefined) {
			return gate;
		}
	}
	if (args.alreadyDispatched) {
		return { kind: "duplicate", wakeKey: args.wakeKey };
	}
	return { kind: "dispatch", plan: args.plan, wakeKey: args.wakeKey };
}

export function newDispatchId(bytes: Uint8Array): DispatchId {
	const hex = [...bytes]
		.map((item) => item.toString(16).padStart(2, "0"))
		.join("");
	return brandString(hex, "DispatchId");
}

export function runUrl(
	value: string,
): { kind: "ok"; value: RunUrl } | { kind: "invalid"; message: string } {
	const trimmed = value.trim();
	if (trimmed.length === 0) {
		return { kind: "invalid", message: "run url is empty" };
	}
	if (/[\r\n]/u.test(trimmed)) {
		return { kind: "invalid", message: "run url must be a single line" };
	}
	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return { kind: "invalid", message: "run url must be http or https" };
		}
	} catch {
		return { kind: "invalid", message: "run url is invalid" };
	}
	return { kind: "ok", value: brandString(trimmed, "RunUrl") };
}

export function dispatchId(
	value: string,
): { kind: "ok"; value: DispatchId } | { kind: "invalid"; message: string } {
	if (value.trim().length === 0) {
		return { kind: "invalid", message: "dispatch id is empty" };
	}
	return { kind: "ok", value: brandString(value, "DispatchId") };
}
