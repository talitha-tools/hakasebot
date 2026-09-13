import type {
	CommentId,
	CommitSha,
	GithubToken,
	Plan,
	ParseResult,
	PullNumber,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import {
	autoWakeCadenceMayReplace,
	newDispatchId,
	wakeKeyFor,
} from "@hakasebot/core/wake/domain.ts";
import type {
	DispatchId,
	WakeEvent,
	WakeOutcome,
} from "@hakasebot/core/wake/domain.ts";
import {
	commentContainsWakeMarker,
	progressCommentPrKey,
	renderProgressComment,
} from "@hakasebot/core/wake/progress-comment.ts";

import type { SupersededWakeRow } from "#/home/wake-run-row.ts";

import type {
	WakeDeps,
	WakeHome,
	WakeRoute,
	WakeStore,
} from "./deps.server.ts";
import { startHomeRun } from "./start-home-run.server.ts";

export type PriorAutoWake = Awaited<ReturnType<WakeStore["findAutoWakeForPr"]>>;

function planCommentId(plan: Plan): CommentId | undefined {
	if (plan.kind === "review") {
		return undefined;
	}
	return plan.commentId;
}

async function upsertProgressComment(args: {
	body: string;
	deps: WakeDeps;
	pullNumber: PullNumber;
	repo: RepoRef;
	token: GithubToken;
	prKey: string;
}): Promise<ParseResult<CommentId>> {
	const listed = await args.deps.github.listIssueComments({
		pullNumber: args.pullNumber,
		repo: args.repo,
		token: args.token,
	});
	if (listed.kind === "invalid") {
		return listed;
	}
	const existing = listed.value.find((row) =>
		commentContainsWakeMarker({ body: row.body, prKey: args.prKey }),
	);
	if (existing !== undefined) {
		const patched = await args.deps.github.patchIssueComment({
			body: args.body,
			commentId: existing.id,
			repo: args.repo,
			token: args.token,
		});
		if (patched.kind === "invalid") {
			return patched;
		}
		return { kind: "ok", value: existing.id };
	}
	return args.deps.github.createIssueComment({
		body: args.body,
		pullNumber: args.pullNumber,
		repo: args.repo,
		token: args.token,
	});
}

async function createQueuedProgressComment(args: {
	consumer: RepoRef;
	consumerToken: GithubToken;
	deps: WakeDeps;
	dispatchId: DispatchId;
	prKey: string;
	pullNumber: PullNumber;
}): Promise<CommentId | undefined> {
	const progress = await upsertProgressComment({
		body: renderProgressComment({
			prKey: args.prKey,
			runUrl: undefined,
			status: "queued",
		}),
		deps: args.deps,
		prKey: args.prKey,
		pullNumber: args.pullNumber,
		repo: args.consumer,
		token: args.consumerToken,
	});
	if (progress.kind !== "ok") {
		return undefined;
	}
	await args.deps.store.updateWakeIfStatus(args.dispatchId, "queued", {
		progressCommentId: progress.value,
		status: "queued",
	});
	return progress.value;
}

async function resolveHeadSha(args: {
	consumerToken: GithubToken;
	deps: WakeDeps;
	event: WakeEvent;
	plan: Plan;
}): Promise<CommitSha | undefined> {
	if (args.event.headSha !== undefined) {
		return args.event.headSha;
	}
	const fetched = await args.deps.github.fetchPullHeadSha({
		pullNumber: args.plan.pullNumber,
		repo: args.event.consumer,
		token: args.consumerToken,
	});
	return fetched.kind === "ok" ? fetched.value : undefined;
}

function dispatchInputs(args: {
	dispatchId: DispatchId;
	event: WakeEvent;
	headSha: CommitSha | undefined;
	plan: Plan;
	progressCommentId: CommentId | undefined;
	route: WakeRoute;
}): Record<string, string> {
	const commentId = planCommentId(args.plan);
	return {
		comment_id: commentId === undefined ? "" : String(commentId),
		dispatch_id: args.dispatchId,
		head_sha: args.headSha ?? "",
		installation_id: args.event.installationId,
		plan: args.plan.kind,
		progress_comment_id:
			args.progressCommentId === undefined
				? ""
				: String(args.progressCommentId),
		pull_number: String(args.plan.pullNumber),
		route_generation:
			args.route.generation === undefined ? "" : String(args.route.generation),
		target_repo: `${args.event.consumer.owner}/${args.event.consumer.name}`,
		consumer_repo_id: String(args.event.consumer.id),
	};
}

async function insertWakeRun(args: {
	deps: WakeDeps;
	dispatchId: DispatchId;
	event: WakeEvent;
	headSha: CommitSha | undefined;
	home: WakeHome;
	plan: Plan;
	priorAutoWake: PriorAutoWake;
	route: WakeRoute;
}): Promise<"inserted" | "duplicate"> {
	return args.deps.store.insertWake({
		commentId: planCommentId(args.plan),
		consumer: args.event.consumer,
		dispatchId: args.dispatchId,
		githubUserId: args.route.userGithubUserId,
		headSha: args.headSha,
		home: args.home,
		key: wakeKeyFor({
			autoReviewCadence: args.route.autoReviewCadence,
			consumer: args.event.consumer,
			headSha: args.headSha,
			plan: args.plan,
		}),
		plan: args.plan,
		pullNumber: args.plan.pullNumber,
		replace: autoWakeCadenceMayReplace({
			cadence: args.route.autoReviewCadence,
			priorStatus: args.priorAutoWake?.status,
		}),
	});
}

interface QueueWakeArgs {
	consumerToken: GithubToken;
	deps: WakeDeps;
	event: WakeEvent;
	home: WakeHome;
	plan: Plan;
	priorAutoWake: PriorAutoWake;
	route: WakeRoute;
}

async function queueWakeRun(args: QueueWakeArgs): Promise<
	| { kind: "duplicate"; dispatchId: DispatchId }
	| {
			kind: "queued";
			dispatchId: DispatchId;
			headSha: CommitSha | undefined;
			superseded: readonly SupersededWakeRow[];
	  }
> {
	const { deps, event, plan } = args;
	const headSha = await resolveHeadSha(args);
	const dispatchId = newDispatchId(deps.randomBytes(16));
	const inserted = await insertWakeRun({ ...args, dispatchId, headSha });
	if (inserted === "duplicate") {
		return { kind: "duplicate", dispatchId };
	}
	const superseded =
		plan.kind === "review"
			? await deps.store.supersedeInFlightReviewWakes({
					consumer: event.consumer,
					dispatchId,
					pullNumber: plan.pullNumber,
				})
			: [];
	return { kind: "queued", dispatchId, headSha, superseded };
}

export async function queueAndDispatch(
	args: QueueWakeArgs,
): Promise<WakeOutcome> {
	const { deps, event, plan } = args;
	const queued = await queueWakeRun(args);
	if (queued.kind === "duplicate") {
		return { kind: "duplicate", dispatchId: queued.dispatchId };
	}
	const prKey = progressCommentPrKey({
		consumer: event.consumer,
		pullNumber: plan.pullNumber,
	});
	const progressCommentId = await createQueuedProgressComment({
		consumer: event.consumer,
		consumerToken: args.consumerToken,
		deps,
		dispatchId: queued.dispatchId,
		prKey,
		pullNumber: plan.pullNumber,
	});
	const inputs = dispatchInputs({
		dispatchId: queued.dispatchId,
		event,
		headSha: queued.headSha,
		plan,
		progressCommentId,
		route: args.route,
	});
	return startHomeRun({
		consumer: event.consumer,
		consumerToken: args.consumerToken,
		deps,
		dispatchId: queued.dispatchId,
		home: args.home,
		inputs,
		prKey,
		progressCommentId,
		pullNumber: plan.pullNumber,
		superseded: queued.superseded,
	});
}
