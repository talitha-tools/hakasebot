import type { AppDb } from "@hakasebot/core/db/client.ts";
import { firstRow } from "@hakasebot/core/db/row.ts";
import { repoRoutes } from "@hakasebot/core/db/schema.ts";
import type {
	GithubInstallationId,
	ParseResult,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import { errorMessage } from "@hakasebot/core/error-message.ts";
import { and, eq, isNull, ne, or } from "drizzle-orm";

import { m as msg } from "#/paraglide/messages.js";

import { parseReleasedRows, parseRouteRow } from "./route-row.ts";
import type { ReleasedRepo, RepoRoute } from "./route-row.ts";

export type { ReleasedRepo, RepoRoute } from "./route-row.ts";

export type ClaimOutcome =
	| { kind: "claimed"; route: RepoRoute }
	| { kind: "held-by-other" };

export type ReleaseOutcome = "released" | "not-held";

export interface RouteStore {
	claimRoute: (args: {
		githubUserId: string;
		now: number;
		repo: RepoRef;
	}) => Promise<ParseResult<ClaimOutcome>>;
	releaseRoute: (args: {
		githubUserId: string;
		repo: RepoRef;
	}) => Promise<ParseResult<ReleaseOutcome>>;
	releaseByInstallationId: (args: {
		installationId: GithubInstallationId;
	}) => Promise<ParseResult<ReleasedRepo[]>>;
	releaseReposByInstallationId: (args: {
		installationId: GithubInstallationId;
		repos: readonly RepoRef[];
	}) => Promise<ParseResult<ReleasedRepo[]>>;
	routeHolder: (repo: RepoRef) => Promise<ParseResult<RepoRoute | undefined>>;
	setBotInstallation: (args: {
		installationId: GithubInstallationId;
		repo: RepoRef;
	}) => Promise<ParseResult<RepoRoute>>;
}

function storeError(error: unknown): { kind: "invalid"; message: string } {
	return {
		kind: "invalid",
		message: errorMessage(error, msg.route_store_failed()),
	};
}

async function readRoute(
	db: AppDb,
	repo: RepoRef,
): Promise<ParseResult<RepoRoute | undefined>> {
	try {
		const rows = await db
			.select()
			.from(repoRoutes)
			.where(eq(repoRoutes.repoId, repo.id))
			.limit(1);
		const row = firstRow(rows);
		if (row === undefined) {
			return { kind: "ok", value: undefined };
		}
		const parsed = parseRouteRow(row);
		if (parsed.kind === "invalid") {
			return parsed;
		}
		return { kind: "ok", value: parsed.value };
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function releaseAllForInstallation(
	db: AppDb,
	installationId: GithubInstallationId,
): Promise<ParseResult<ReleasedRepo[]>> {
	try {
		const selected = await db
			.select({
				githubUserId: repoRoutes.githubUserId,
				repoId: repoRoutes.repoId,
				repoName: repoRoutes.repoName,
				repoOwner: repoRoutes.repoOwner,
			})
			.from(repoRoutes)
			.where(eq(repoRoutes.botInstallationId, installationId));
		await db
			.delete(repoRoutes)
			.where(eq(repoRoutes.botInstallationId, installationId));
		return parseReleasedRows(selected);
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function releaseListedRepos(
	db: AppDb,
	args: { installationId: GithubInstallationId; repos: readonly RepoRef[] },
): Promise<ParseResult<ReleasedRepo[]>> {
	try {
		const selected = await Promise.all(
			args.repos.map(async (repo) => {
				const rows = await db
					.select({
						githubUserId: repoRoutes.githubUserId,
						repoId: repoRoutes.repoId,
						repoName: repoRoutes.repoName,
						repoOwner: repoRoutes.repoOwner,
					})
					.from(repoRoutes)
					.where(
						and(
							eq(repoRoutes.botInstallationId, args.installationId),
							eq(repoRoutes.repoId, repo.id),
						),
					)
					.limit(1);
				return firstRow(rows);
			}),
		);
		const rows = selected.filter((row) => row !== undefined);
		await Promise.all(
			rows.map(async (row) =>
				db
					.delete(repoRoutes)
					.where(
						and(
							eq(repoRoutes.botInstallationId, args.installationId),
							eq(repoRoutes.repoId, row.repoId),
						),
					),
			),
		);
		return parseReleasedRows(rows);
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function claimRoute(
	db: AppDb,
	args: { githubUserId: string; now: number; repo: RepoRef },
): Promise<ParseResult<ClaimOutcome>> {
	try {
		await db
			.insert(repoRoutes)
			.values({
				claimedAt: args.now,
				generation: args.now,
				githubUserId: args.githubUserId,
				repoId: args.repo.id,
				repoName: args.repo.name,
				repoOwner: args.repo.owner,
			})
			.onConflictDoNothing();
		const held = await readRoute(db, args.repo);
		if (held.kind === "invalid") {
			return held;
		}
		if (held.value === undefined) {
			return { kind: "invalid", message: msg.repo_route_missing_claim() };
		}
		if (held.value.githubUserId !== args.githubUserId) {
			return { kind: "ok", value: { kind: "held-by-other" } };
		}
		return { kind: "ok", value: { kind: "claimed", route: held.value } };
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function releaseRoute(
	db: AppDb,
	args: { githubUserId: string; repo: RepoRef },
): Promise<ParseResult<ReleaseOutcome>> {
	try {
		const held = await readRoute(db, args.repo);
		if (held.kind === "invalid") {
			return held;
		}
		if (held.value === undefined) {
			return { kind: "ok", value: "not-held" };
		}
		if (held.value.githubUserId !== args.githubUserId) {
			return { kind: "ok", value: "not-held" };
		}
		await db
			.delete(repoRoutes)
			.where(
				and(
					eq(repoRoutes.repoId, args.repo.id),
					eq(repoRoutes.githubUserId, args.githubUserId),
				),
			);
		return { kind: "ok", value: "released" };
	} catch (error: unknown) {
		return storeError(error);
	}
}

async function setBotInstallation(
	db: AppDb,
	args: { installationId: GithubInstallationId; repo: RepoRef },
): Promise<ParseResult<RepoRoute>> {
	try {
		const unclaimedOrOtherApp = or(
			isNull(repoRoutes.botInstallationId),
			ne(repoRoutes.botInstallationId, args.installationId),
		);
		await db
			.update(repoRoutes)
			.set({ botInstallationId: args.installationId })
			.where(and(eq(repoRoutes.repoId, args.repo.id), unclaimedOrOtherApp));
		const held = await readRoute(db, args.repo);
		if (held.kind === "invalid") {
			return held;
		}
		if (held.value === undefined) {
			return {
				kind: "invalid",
				message: msg.repo_route_missing_bot(),
			};
		}
		return { kind: "ok", value: held.value };
	} catch (error: unknown) {
		return storeError(error);
	}
}

export function createRouteStore(db: AppDb): RouteStore {
	return {
		claimRoute: async (args) => claimRoute(db, args),
		releaseRoute: async (args) => releaseRoute(db, args),
		releaseByInstallationId: async (args) =>
			releaseAllForInstallation(db, args.installationId),
		releaseReposByInstallationId: async (args) => releaseListedRepos(db, args),
		routeHolder: async (repo) => readRoute(db, repo),
		setBotInstallation: async (args) => setBotInstallation(db, args),
	};
}
