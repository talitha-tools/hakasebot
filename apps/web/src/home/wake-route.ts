import type { AppDb } from "@hakasebot/core/db/client.ts";
import { firstRow } from "@hakasebot/core/db/row.ts";
import {
	enabledRepos,
	homeRepos,
	repoRoutes,
} from "@hakasebot/core/db/schema.ts";
import { parseSelect, wakeRouteJoinSelect } from "@hakasebot/core/db/zod.ts";
import type { ParseResult, RepoId } from "@hakasebot/core/domain.ts";
import { githubAppInstallationId, repoRef } from "@hakasebot/core/domain.ts";
import { d1Present } from "@hakasebot/core/vault/store.ts";
import {
	defaultAutoAuthors,
	defaultAutoBranches,
	defaultAutoReviewCadence,
	parseAutoAuthorsFromRow,
	parseAutoBranchesFromRow,
	parseAutoReviewCadence,
	parseWakeMode,
} from "@hakasebot/core/wake/domain.ts";
import { and, eq } from "drizzle-orm";

import type { WakeHome, WakeRoute } from "#/wake/deps.server.ts";

function disabledRoute(): WakeRoute {
	return {
		autoAuthors: defaultAutoAuthors(),
		autoBranches: defaultAutoBranches(),
		autoReviewCadence: defaultAutoReviewCadence(),
		enabled: false,
		generation: undefined,
		home: undefined,
		wakeMode: "auto",
	};
}

function routeSettings(row: {
	autoAuthorSkip: string | null;
	autoAuthors: string | null;
	autoBranchList: string | null;
	autoBranchSkip: string | null;
	autoBranches: string | null;
	autoReviewCadence: string | null;
	wakeMode: string | null;
}): ParseResult<
	Pick<
		WakeRoute,
		"autoAuthors" | "autoBranches" | "autoReviewCadence" | "wakeMode"
	>
> {
	const wakeMode = parseWakeMode(row.wakeMode ?? "auto");
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
	const autoBranches = parseAutoBranchesFromRow({
		branches: row.autoBranchList,
		scope: row.autoBranches,
		skipBranches: row.autoBranchSkip,
	});
	return {
		kind: "ok",
		value: {
			autoAuthors:
				autoAuthors.kind === "ok" ? autoAuthors.value : defaultAutoAuthors(),
			autoBranches:
				autoBranches.kind === "ok" ? autoBranches.value : defaultAutoBranches(),
			autoReviewCadence: autoReviewCadence.value,
			wakeMode: wakeMode.value,
		},
	};
}

function routeHome(row: {
	homeName: string | null;
	homeOwner: string | null;
	homeRepoId: string | null;
	installationId: string | null;
}): WakeHome | undefined {
	if (
		!d1Present(row.homeOwner) ||
		!d1Present(row.homeName) ||
		!d1Present(row.homeRepoId) ||
		!d1Present(row.installationId) ||
		row.installationId === ""
	) {
		return undefined;
	}
	const homeRepo = repoRef({
		id: row.homeRepoId,
		name: row.homeName,
		owner: row.homeOwner,
	});
	const installationId = githubAppInstallationId(row.installationId);
	if (homeRepo.kind === "invalid" || installationId.kind === "invalid") {
		return undefined;
	}
	return { installationId: installationId.value, repo: homeRepo.value };
}

function enabledWakeRoute(row: unknown): ParseResult<WakeRoute> {
	const selected = parseSelect(
		wakeRouteJoinSelect,
		row,
		"wake route row is invalid",
	);
	if (selected.kind === "invalid") {
		return selected;
	}
	const settings = routeSettings(selected.value);
	if (settings.kind === "invalid") {
		return settings;
	}
	return {
		kind: "ok",
		value: {
			...settings.value,
			enabled: true,
			generation: selected.value.generation,
			home: routeHome(selected.value),
			userGithubUserId: selected.value.githubUserId,
		},
	};
}

export async function findWakeRoute(
	db: AppDb,
	repoId: RepoId,
): Promise<ParseResult<WakeRoute>> {
	const rows = await db
		.select({
			autoAuthorSkip: enabledRepos.autoAuthorSkip,
			autoAuthors: enabledRepos.autoAuthors,
			autoBranchList: enabledRepos.autoBranchList,
			autoBranchSkip: enabledRepos.autoBranchSkip,
			autoBranches: enabledRepos.autoBranches,
			autoReviewCadence: enabledRepos.autoReviewCadence,
			generation: repoRoutes.generation,
			githubUserId: repoRoutes.githubUserId,
			homeName: homeRepos.repoName,
			homeOwner: homeRepos.repoOwner,
			homeRepoId: homeRepos.repoId,
			installationId: homeRepos.installationId,
			wakeMode: enabledRepos.wakeMode,
		})
		.from(repoRoutes)
		.leftJoin(homeRepos, eq(homeRepos.githubUserId, repoRoutes.githubUserId))
		.innerJoin(
			enabledRepos,
			and(
				eq(enabledRepos.githubUserId, repoRoutes.githubUserId),
				eq(enabledRepos.repoId, repoRoutes.repoId),
			),
		)
		.where(eq(repoRoutes.repoId, repoId))
		.limit(1);
	const row = firstRow(rows);
	if (row === undefined) {
		return { kind: "ok", value: disabledRoute() };
	}
	return enabledWakeRoute(row);
}
