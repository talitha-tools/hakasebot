import type { GithubToken, ParseResult, Plan } from "@hakasebot/core/domain.ts";
import {
	decideWake,
	newDispatchId,
	wakeKeyFor,
} from "@hakasebot/core/wake/domain.ts";
import type {
	WakeEvent,
	WakeOutcome,
	WakeStatus,
} from "@hakasebot/core/wake/domain.ts";
import { renderFailureComment } from "@hakasebot/core/wake/progress-comment.ts";

import type { WakeDeps, WakeRoute } from "./deps.server.ts";
import { queueAndDispatch } from "./queue-wake.server.ts";
import type { PriorAutoWake } from "./queue-wake.server.ts";

function wakeDecision(args: {
	defaultBranch: string | undefined;
	event: WakeEvent;
	plan: Plan;
	priorStatus: WakeStatus | undefined;
	route: WakeRoute;
}): ReturnType<typeof decideWake> {
	return decideWake({
		alreadyDispatched: false,
		autoAuthorsCheck: {
			author: args.event.author,
			autoAuthors: args.route.autoAuthors,
			userGithubUserId: args.route.userGithubUserId,
		},
		autoReviewCadence: args.route.autoReviewCadence,
		autoBranchesCheck: {
			baseRef: args.event.baseRef,
			defaultBranch: args.defaultBranch,
			autoBranches: args.route.autoBranches,
		},
		draft: args.event.draft,
		enabled: args.route.enabled,
		homePresent: args.route.home !== undefined,
		plan: args.plan,
		priorAutoWakeStatus: args.priorStatus,
		wakeMode: args.route.wakeMode,
		wakeKey: wakeKeyFor({
			autoReviewCadence: args.route.autoReviewCadence,
			consumer: args.event.consumer,
			headSha: args.event.headSha,
			plan: args.plan,
		}),
	});
}

/** Mints a consumer token only when the auto-branches check needs the default branch fetched. */
async function resolveDefaultBranch(args: {
	deps: WakeDeps;
	event: WakeEvent;
	plan: Plan;
	route: WakeRoute;
}): Promise<{
	consumerToken: ParseResult<GithubToken> | undefined;
	defaultBranch: string | undefined;
}> {
	const { defaultBranch } = args.event;
	const wantsDefault =
		args.plan.kind === "review" &&
		args.route.autoBranches.scope === "default" &&
		defaultBranch === undefined;
	if (!wantsDefault) {
		return { consumerToken: undefined, defaultBranch };
	}
	const consumerToken = await args.deps.github.mint(args.event.installationId);
	if (consumerToken.kind !== "ok") {
		return { consumerToken, defaultBranch };
	}
	const fetched = await args.deps.github.fetchRepoDefaultBranch({
		repo: args.event.consumer,
		token: consumerToken.value,
	});
	return {
		consumerToken,
		defaultBranch: fetched.kind === "ok" ? fetched.value : defaultBranch,
	};
}

async function findPriorAutoWake(args: {
	deps: WakeDeps;
	event: WakeEvent;
	plan: Plan;
}): Promise<PriorAutoWake> {
	if (args.plan.kind !== "review") {
		return undefined;
	}
	return args.deps.store.findAutoWakeForPr({
		consumer: args.event.consumer,
		pullNumber: args.plan.pullNumber,
	});
}

async function refuseWithoutModelSlots(args: {
	consumerToken: GithubToken;
	deps: WakeDeps;
	event: WakeEvent;
	plan: Plan;
	route: WakeRoute;
}): Promise<WakeOutcome | undefined> {
	const { userGithubUserId } = args.route;
	if (userGithubUserId === undefined) {
		return {
			kind: "unavailable",
			message: "couldn't resolve model slots for this wake",
		};
	}
	const slots = await args.deps.store.repoHasModelSlots({
		githubUserId: userGithubUserId,
		repo: args.event.consumer,
	});
	if (slots.kind === "invalid") {
		return { kind: "unavailable", message: slots.message };
	}
	if (slots.value) {
		return undefined;
	}
	await args.deps.github.createIssueComment({
		body: renderFailureComment({
			kind: "no-model-slots",
			runUrl: undefined,
		}),
		pullNumber: args.plan.pullNumber,
		repo: args.event.consumer,
		token: args.consumerToken,
	});
	return { kind: "ignored", reason: { kind: "no-model-slots" } };
}

async function dispatchAcceptedWake(args: {
	consumerToken: ParseResult<GithubToken> | undefined;
	deps: WakeDeps;
	event: WakeEvent;
	plan: Plan;
	priorAutoWake: PriorAutoWake;
	route: WakeRoute;
}): Promise<WakeOutcome> {
	const { deps, event, plan, route } = args;
	const { home } = route;
	if (home === undefined) {
		return { kind: "ignored", reason: { kind: "home-missing" } };
	}
	const token =
		args.consumerToken ?? (await deps.github.mint(event.installationId));
	if (token.kind === "invalid") {
		return {
			kind: "unavailable",
			message: "couldn't get a github app token for this repo",
		};
	}
	const refused = await refuseWithoutModelSlots({
		consumerToken: token.value,
		deps,
		event,
		plan,
		route,
	});
	if (refused !== undefined) {
		return refused;
	}
	return queueAndDispatch({
		consumerToken: token.value,
		deps,
		event,
		home,
		plan,
		priorAutoWake: args.priorAutoWake,
		route,
	});
}

export async function processPlannedWake(args: {
	deps: WakeDeps;
	event: WakeEvent;
	plan: Plan;
	route: WakeRoute;
}): Promise<WakeOutcome> {
	const { deps, plan, route } = args;
	const priorAutoWake = await findPriorAutoWake(args);
	const { consumerToken, defaultBranch } = await resolveDefaultBranch(args);
	const decision = wakeDecision({
		defaultBranch,
		event: args.event,
		plan,
		priorStatus: priorAutoWake?.status,
		route,
	});
	if (decision.kind === "ignore") {
		return { kind: "ignored", reason: decision.reason };
	}
	if (decision.kind === "duplicate") {
		return {
			kind: "duplicate",
			dispatchId:
				priorAutoWake?.dispatchId ?? newDispatchId(deps.randomBytes(16)),
		};
	}
	return dispatchAcceptedWake({
		consumerToken,
		deps,
		event: args.event,
		plan,
		priorAutoWake,
		route,
	});
}
