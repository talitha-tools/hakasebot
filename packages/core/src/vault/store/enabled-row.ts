import type { EnabledRepoRecord } from "#/db/schema.ts";
import { enabledRepoSelect, parseSelect } from "#/db/zod.ts";
import { repoRef } from "#/domain.ts";
import type { ParseResult } from "#/domain.ts";
import {
	parseAutoAuthorsFromRow,
	parseAutoBranchesFromRow,
	parseAutoReviewCadence,
	parseWakeMode,
} from "#/wake/domain.ts";
import type {
	AutoAuthors,
	AutoBranches,
	AutoReviewCadence,
	WakeMode,
} from "#/wake/domain.ts";

import { nullableText, nullableTimestamp } from "./rows.ts";
import type { EnabledRepoRow } from "./types.ts";

function parseIgnorePaths(
	value: string | null | undefined,
): ParseResult<readonly string[] | undefined> {
	const text = nullableText(value);
	if (text === undefined) {
		return { kind: "ok", value: undefined };
	}
	try {
		const parsed: unknown = JSON.parse(text);
		if (
			!Array.isArray(parsed) ||
			!parsed.every((item) => typeof item === "string")
		) {
			return { kind: "invalid", message: "repo ignore paths are invalid" };
		}
		return { kind: "ok", value: parsed };
	} catch {
		return { kind: "invalid", message: "repo ignore paths are invalid" };
	}
}

function parseEnabledRepoPolicies(row: EnabledRepoRecord): ParseResult<{
	autoAuthors: AutoAuthors;
	autoBranches: AutoBranches;
	autoReviewCadence: AutoReviewCadence;
	wakeMode: WakeMode;
}> {
	const wakeMode = parseWakeMode(row.wakeMode);
	if (wakeMode.kind === "invalid") {
		return wakeMode;
	}
	const autoReviewCadence = parseAutoReviewCadence(row.autoReviewCadence);
	if (autoReviewCadence.kind === "invalid") {
		return autoReviewCadence;
	}
	const autoAuthors = parseAutoAuthorsFromRow({
		scope: row.autoAuthors,
		skipLogins: row.autoAuthorSkip,
	});
	if (autoAuthors.kind === "invalid") {
		return autoAuthors;
	}
	const autoBranches = parseAutoBranchesFromRow({
		branches: row.autoBranchList,
		scope: row.autoBranches,
		skipBranches: row.autoBranchSkip,
	});
	if (autoBranches.kind === "invalid") {
		return autoBranches;
	}
	return {
		kind: "ok",
		value: {
			autoAuthors: autoAuthors.value,
			autoBranches: autoBranches.value,
			autoReviewCadence: autoReviewCadence.value,
			wakeMode: wakeMode.value,
		},
	};
}

function assembleEnabledRepo(
	row: EnabledRepoRecord,
): ParseResult<EnabledRepoRow> {
	const repo = repoRef({
		id: row.repoId,
		name: row.repoName,
		owner: row.repoOwner,
	});
	if (repo.kind === "invalid") {
		return repo;
	}
	const policies = parseEnabledRepoPolicies(row);
	if (policies.kind === "invalid") {
		return policies;
	}
	const ignorePaths = parseIgnorePaths(row.ignorePaths);
	if (ignorePaths.kind === "invalid") {
		return ignorePaths;
	}
	const prompt = nullableText(row.reviewPrompt);
	return {
		kind: "ok",
		value: {
			...policies.value,
			homeAt: nullableTimestamp(row.homeAt),
			lastSyncedAt: nullableTimestamp(row.lastSyncedAt),
			botAt: nullableTimestamp(row.botAt),
			repo: repo.value,
			syncedEpoch: row.syncedEpoch,
			...(prompt === undefined ? {} : { prompt }),
			...(ignorePaths.value === undefined
				? {}
				: { ignorePaths: ignorePaths.value }),
		},
	};
}

export function parseEnabledRepoRow(row: unknown): ParseResult<EnabledRepoRow> {
	const selected = parseSelect(
		enabledRepoSelect,
		row,
		"enabled repo row is invalid",
	);
	if (selected.kind === "invalid") {
		return selected;
	}
	return assembleEnabledRepo(selected.value);
}
