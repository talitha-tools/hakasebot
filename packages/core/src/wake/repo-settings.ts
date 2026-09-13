import type { ParseResult } from "#/domain.ts";

import type { AutoAuthorScope } from "./auto-authors.ts";
import { defaultAutoAuthors, parseAutoAuthorScope } from "./auto-authors.ts";
import type { AutoBranchScope } from "./auto-branches.ts";
import { defaultAutoBranches, parseAutoBranchScope } from "./auto-branches.ts";

export type WakeMode = "auto" | "mention-only";

export const AUTO_REVIEW_CADENCES = ["every-push", "once-per-pr"] as const;
export type AutoReviewCadence = (typeof AUTO_REVIEW_CADENCES)[number];

export function defaultWakeMode(): WakeMode {
	return "auto";
}

export function defaultAutoReviewCadence(): AutoReviewCadence {
	return "every-push";
}

export interface RepoSettingDefaults {
	autoAuthorScope: AutoAuthorScope;
	autoBranchScope: AutoBranchScope;
	autoReviewCadence: AutoReviewCadence;
	wakeMode: WakeMode;
}

export function parseWakeMode(value: unknown): ParseResult<WakeMode> {
	if (value === "auto" || value === "mention-only") {
		return { kind: "ok", value };
	}
	return { kind: "invalid", message: "wake mode is invalid" };
}

export function parseAutoReviewCadence(
	value: unknown,
): ParseResult<AutoReviewCadence> {
	if (value === undefined || value === null || value === "") {
		return { kind: "ok", value: defaultAutoReviewCadence() };
	}
	if (typeof value !== "string") {
		return { kind: "invalid", message: "auto review cadence is invalid" };
	}
	for (const cadence of AUTO_REVIEW_CADENCES) {
		if (cadence === value) {
			return { kind: "ok", value: cadence };
		}
	}
	return { kind: "invalid", message: "auto review cadence is invalid" };
}

export function productRepoSettingDefaults(): RepoSettingDefaults {
	return {
		autoAuthorScope: defaultAutoAuthors().scope,
		autoBranchScope: defaultAutoBranches().scope,
		autoReviewCadence: defaultAutoReviewCadence(),
		wakeMode: defaultWakeMode(),
	};
}

export function repoSettingDefaultsFromRow(args: {
	autoAuthors: unknown;
	autoBranches: unknown;
	autoReviewCadence: unknown;
	wakeMode: unknown;
}): RepoSettingDefaults {
	const product = productRepoSettingDefaults();
	const wakeMode = parseWakeMode(args.wakeMode);
	const autoAuthorScope = parseAutoAuthorScope(args.autoAuthors);
	const autoBranchScope = parseAutoBranchScope(args.autoBranches);
	const autoReviewCadence = parseAutoReviewCadence(args.autoReviewCadence);
	return {
		autoAuthorScope:
			autoAuthorScope.kind === "ok"
				? autoAuthorScope.value
				: product.autoAuthorScope,
		autoBranchScope:
			autoBranchScope.kind === "ok"
				? autoBranchScope.value
				: product.autoBranchScope,
		autoReviewCadence:
			autoReviewCadence.kind === "ok"
				? autoReviewCadence.value
				: product.autoReviewCadence,
		wakeMode: wakeMode.kind === "ok" ? wakeMode.value : product.wakeMode,
	};
}

export function parseRepoSettingDefaultsInput(args: {
	autoAuthorScope: unknown;
	autoBranchScope: unknown;
	autoReviewCadence: unknown;
	wakeMode: unknown;
}): ParseResult<RepoSettingDefaults> {
	const wakeMode = parseWakeMode(args.wakeMode);
	if (wakeMode.kind === "invalid") {
		return wakeMode;
	}
	const autoAuthorScope = parseAutoAuthorScope(args.autoAuthorScope);
	if (autoAuthorScope.kind === "invalid") {
		return autoAuthorScope;
	}
	const autoBranchScope = parseAutoBranchScope(args.autoBranchScope);
	if (autoBranchScope.kind === "invalid") {
		return autoBranchScope;
	}
	const autoReviewCadence = parseAutoReviewCadence(args.autoReviewCadence);
	if (autoReviewCadence.kind === "invalid") {
		return autoReviewCadence;
	}
	return {
		kind: "ok",
		value: {
			autoAuthorScope: autoAuthorScope.value,
			autoBranchScope: autoBranchScope.value,
			autoReviewCadence: autoReviewCadence.value,
			wakeMode: wakeMode.value,
		},
	};
}
