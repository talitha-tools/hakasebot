import type { ParseResult, RepoRef } from "@hakasebot/core/domain.ts";
import type { HolderRepoAccess } from "@hakasebot/core/github-api.server.ts";

import type { ClaimOutcome, RouteStore } from "#/home/route-store.ts";
import { m as msg } from "#/paraglide/messages.js";

export function shouldReclaimHeldClaim(access: HolderRepoAccess): boolean {
	return access.kind === "no-access";
}

interface ClaimContext {
	checkHolderAccess: (holderGithubUserId: string) => Promise<HolderRepoAccess>;
	disableHolder: (holderGithubUserId: string) => Promise<ParseResult<void>>;
	githubUserId: string;
	now: number;
	repo: RepoRef;
	routes: Pick<RouteStore, "claimRoute" | "releaseRoute" | "routeHolder">;
}

/** Claim again after the holder row disappeared or was released. */
async function retryClaim(args: ClaimContext): Promise<ParseResult<"claimed">> {
	const retry = await args.routes.claimRoute({
		githubUserId: args.githubUserId,
		now: args.now,
		repo: args.repo,
	});
	if (retry.kind === "invalid") {
		return retry;
	}
	if (retry.value.kind === "claimed") {
		return { kind: "ok", value: "claimed" };
	}
	return { kind: "invalid", message: msg.repos_held_by_other() };
}

async function reclaimFromHolder(
	args: ClaimContext,
	holderGithubUserId: string,
): Promise<ParseResult<"claimed">> {
	const access = await args.checkHolderAccess(holderGithubUserId);
	if (!shouldReclaimHeldClaim(access)) {
		return { kind: "invalid", message: msg.repos_held_by_other() };
	}
	const released = await args.routes.releaseRoute({
		githubUserId: holderGithubUserId,
		repo: args.repo,
	});
	if (released.kind === "invalid") {
		return released;
	}
	const disabled = await args.disableHolder(holderGithubUserId);
	if (disabled.kind === "invalid") {
		return disabled;
	}
	return retryClaim(args);
}

async function finishClaimOrReclaim(
	args: ClaimContext & { outcome: ClaimOutcome },
): Promise<ParseResult<"claimed">> {
	if (args.outcome.kind === "claimed") {
		return { kind: "ok", value: "claimed" };
	}
	const held = await args.routes.routeHolder(args.repo);
	if (held.kind === "invalid") {
		return held;
	}
	if (held.value === undefined) {
		return retryClaim(args);
	}
	return reclaimFromHolder(args, held.value.githubUserId);
}

export async function takeRepoClaim(
	args: ClaimContext,
): Promise<ParseResult<"claimed">> {
	const first = await args.routes.claimRoute({
		githubUserId: args.githubUserId,
		now: args.now,
		repo: args.repo,
	});
	if (first.kind === "invalid") {
		return first;
	}
	return finishClaimOrReclaim({ ...args, outcome: first.value });
}
