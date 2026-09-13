import type {
	AutoAuthorScope,
	AutoBranchScope,
	AutoReviewCadence,
} from "@hakasebot/core/wake/domain.ts";

import { m as msg } from "#/paraglide/messages.js";

const AUTO_AUTHOR_LABEL: Record<AutoAuthorScope, () => string> = {
	everyone: msg.auto_author_everyone,
	friends: msg.auto_author_friends,
	you: msg.auto_author_you,
};

const AUTO_AUTHOR_HINT: Record<AutoAuthorScope, () => string> = {
	everyone: msg.auto_author_hint_everyone,
	friends: msg.auto_author_hint_friends,
	you: msg.auto_author_hint_you,
};

export function autoAuthorLabel(scope: AutoAuthorScope): string {
	return AUTO_AUTHOR_LABEL[scope]();
}

export function autoAuthorHint(scope: AutoAuthorScope): string {
	return AUTO_AUTHOR_HINT[scope]();
}

const AUTO_BRANCH_LABEL: Record<AutoBranchScope, () => string> = {
	all: msg.auto_branch_all,
	default: msg.auto_branch_default,
	listed: msg.auto_branch_listed,
};

const AUTO_BRANCH_HINT: Record<AutoBranchScope, () => string> = {
	all: msg.auto_branch_hint_all,
	default: msg.auto_branch_hint_default,
	listed: msg.auto_branch_hint_listed,
};

export function autoBranchLabel(scope: AutoBranchScope): string {
	return AUTO_BRANCH_LABEL[scope]();
}

export function autoBranchHint(scope: AutoBranchScope): string {
	return AUTO_BRANCH_HINT[scope]();
}

const AUTO_REVIEW_CADENCE_LABEL: Record<AutoReviewCadence, () => string> = {
	"every-push": msg.cadence_every_push,
	"once-per-pr": msg.cadence_once,
};

const AUTO_REVIEW_CADENCE_HINT: Record<AutoReviewCadence, () => string> = {
	"every-push": msg.cadence_hint_every_push,
	"once-per-pr": msg.cadence_hint_once,
};

export function autoReviewCadenceLabel(cadence: AutoReviewCadence): string {
	return AUTO_REVIEW_CADENCE_LABEL[cadence]();
}

export function autoReviewCadenceHint(cadence: AutoReviewCadence): string {
	return AUTO_REVIEW_CADENCE_HINT[cadence]();
}
