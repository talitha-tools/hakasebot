import { repoId, repoRef } from "@hakasebot/core/domain.ts";
import type { ParseResult, RepoId, RepoRef } from "@hakasebot/core/domain.ts";
import type { ModelSlotId } from "@hakasebot/core/vault/domain.ts";
import { modelSlotId } from "@hakasebot/core/vault/domain.ts";
import type {
	AutoAuthors,
	AutoBranches,
	AutoReviewCadence,
	RepoSettingDefaults,
	WakeMode,
} from "@hakasebot/core/wake/domain.ts";
import {
	parseAutoAuthors,
	parseAutoBranches,
	parseAutoReviewCadence,
	parseRepoSettingDefaultsInput,
	parseWakeMode,
} from "@hakasebot/core/wake/domain.ts";

import { m as msg } from "#/paraglide/messages.js";

export function parseEnableRepoInput(input: {
	repo: { id: string; owner: string; name: string };
}): ParseResult<RepoRef> {
	return repoRef(input.repo);
}

export function parseRepoIdInput(input: { repo: string }): ParseResult<RepoId> {
	return repoId(input.repo.trim());
}

export function parseSetRepoModelListInput(input: {
	repo: string;
	orderedSlotIds: string[];
}): ParseResult<{
	repoId: RepoId;
	orderedSlotIds: readonly ModelSlotId[];
}> {
	const repo = parseRepoIdInput(input);
	if (repo.kind === "invalid") {
		return repo;
	}
	const ordered: ModelSlotId[] = [];
	for (const raw of input.orderedSlotIds) {
		const parsed = modelSlotId(raw);
		if (parsed.kind === "invalid") {
			return parsed;
		}
		ordered.push(parsed.value);
	}
	return {
		kind: "ok",
		value: { orderedSlotIds: ordered, repoId: repo.value },
	};
}

export function parseSetRepoWakeModeInput(input: {
	repo: string;
	wakeMode: unknown;
}): ParseResult<{ repoId: RepoId; wakeMode: WakeMode }> {
	const repo = parseRepoIdInput(input);
	if (repo.kind === "invalid") {
		return repo;
	}
	const wakeMode = parseWakeMode(input.wakeMode);
	if (wakeMode.kind === "invalid") {
		return wakeMode;
	}
	return {
		kind: "ok",
		value: { repoId: repo.value, wakeMode: wakeMode.value },
	};
}

export function parseSetRepoAutoReviewCadenceInput(input: {
	repo: string;
	autoReviewCadence: unknown;
}): ParseResult<{ autoReviewCadence: AutoReviewCadence; repoId: RepoId }> {
	const repo = parseRepoIdInput(input);
	if (repo.kind === "invalid") {
		return repo;
	}
	const autoReviewCadence = parseAutoReviewCadence(input.autoReviewCadence);
	if (autoReviewCadence.kind === "invalid") {
		return autoReviewCadence;
	}
	return {
		kind: "ok",
		value: { autoReviewCadence: autoReviewCadence.value, repoId: repo.value },
	};
}

export function parseSetRepoAutoAuthorsInput(input: {
	repo: string;
	scope: unknown;
	skipLogins?: unknown;
}): ParseResult<{ autoAuthors: AutoAuthors; repoId: RepoId }> {
	const repo = parseRepoIdInput(input);
	if (repo.kind === "invalid") {
		return repo;
	}
	const autoAuthors = parseAutoAuthors({
		scope: input.scope,
		skipLogins: input.skipLogins,
	});
	if (autoAuthors.kind === "invalid") {
		return autoAuthors;
	}
	return {
		kind: "ok",
		value: { autoAuthors: autoAuthors.value, repoId: repo.value },
	};
}

export function parseSetRepoAutoBranchesInput(input: {
	repo: string;
	scope: unknown;
	branches?: unknown;
	skipBranches?: unknown;
}): ParseResult<{ autoBranches: AutoBranches; repoId: RepoId }> {
	const repo = parseRepoIdInput(input);
	if (repo.kind === "invalid") {
		return repo;
	}
	const autoBranches = parseAutoBranches({
		branches: input.branches,
		scope: input.scope,
		skipBranches: input.skipBranches,
	});
	if (autoBranches.kind === "invalid") {
		return autoBranches;
	}
	return {
		kind: "ok",
		value: { autoBranches: autoBranches.value, repoId: repo.value },
	};
}

export function parseSetRepoReviewInstructionsInput(input: {
	repo: string;
	prompt?: unknown;
	ignorePaths?: unknown;
}): ParseResult<{
	repoId: RepoId;
	prompt?: string;
	ignorePaths?: readonly string[];
}> {
	const repo = parseRepoIdInput(input);
	if (repo.kind === "invalid") {
		return repo;
	}
	if (input.prompt !== undefined && typeof input.prompt !== "string") {
		return { kind: "invalid", message: msg.notes_prompt_invalid() };
	}
	if (
		input.ignorePaths !== undefined &&
		(!Array.isArray(input.ignorePaths) ||
			!input.ignorePaths.every((path) => typeof path === "string"))
	) {
		return { kind: "invalid", message: msg.notes_skip_invalid() };
	}
	const prompt = input.prompt?.trim();
	const ignorePaths =
		input.ignorePaths
			?.map((path) => path.trim())
			.filter((path) => path.length > 0) ?? [];
	return {
		kind: "ok",
		value: {
			repoId: repo.value,
			...(prompt === undefined || prompt.length === 0 ? {} : { prompt }),
			...(ignorePaths.length === 0 ? {} : { ignorePaths }),
		},
	};
}

export function parseSetRepoSettingDefaultsInput(input: {
	autoAuthorScope: unknown;
	autoBranchScope: unknown;
	autoReviewCadence: unknown;
	wakeMode: unknown;
}): ParseResult<RepoSettingDefaults> {
	return parseRepoSettingDefaultsInput(input);
}
