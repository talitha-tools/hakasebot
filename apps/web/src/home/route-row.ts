import {
	parseSelect,
	releasedRepoSelect,
	repoRouteSelect,
} from "@hakasebot/core/db/zod.ts";
import type {
	GithubInstallationId,
	ParseResult,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import { githubAppInstallationId } from "@hakasebot/core/domain.ts";
import { d1Present } from "@hakasebot/core/vault/store.ts";
import { parseRepoDbRow } from "@hakasebot/core/vault/store/rows.ts";

export interface RepoRoute {
	claimedAt: number;
	generation: number;
	githubUserId: string;
	botInstallationId: GithubInstallationId | undefined;
	repo: RepoRef;
}

export interface ReleasedRepo {
	githubUserId: string;
	repo: RepoRef;
}

function parseRouteRow(row: unknown): ParseResult<RepoRoute> {
	const selected = parseSelect(
		repoRouteSelect,
		row,
		"repo route row is invalid",
	);
	if (selected.kind === "invalid") {
		return selected;
	}
	const {
		botInstallationId,
		claimedAt,
		generation,
		githubUserId,
		repoId,
		repoName,
		repoOwner,
	} = selected.value;
	const repo = parseRepoDbRow({
		repoId,
		repoName,
		repoOwner,
	});
	if (repo.kind === "invalid") {
		return repo;
	}
	let parsedBotInstallationId: GithubInstallationId | undefined;
	if (d1Present(botInstallationId) && botInstallationId.length > 0) {
		const parsed = githubAppInstallationId(botInstallationId);
		if (parsed.kind === "invalid") {
			return parsed;
		}
		parsedBotInstallationId = parsed.value;
	}
	return {
		kind: "ok",
		value: {
			botInstallationId: parsedBotInstallationId,
			claimedAt,
			generation,
			githubUserId,
			repo: repo.value,
		},
	};
}

function parseReleasedRows(
	rows: readonly unknown[],
): ParseResult<ReleasedRepo[]> {
	const released: ReleasedRepo[] = [];
	for (const row of rows) {
		const selected = parseSelect(
			releasedRepoSelect,
			row,
			"released repo row is invalid",
		);
		if (selected.kind === "invalid") {
			return selected;
		}
		const { githubUserId, repoId, repoName, repoOwner } = selected.value;
		const repo = parseRepoDbRow({
			repoId,
			repoName,
			repoOwner,
		});
		if (repo.kind === "invalid") {
			return repo;
		}
		released.push({
			githubUserId,
			repo: repo.value,
		});
	}
	return { kind: "ok", value: released };
}

export { parseReleasedRows, parseRouteRow };
