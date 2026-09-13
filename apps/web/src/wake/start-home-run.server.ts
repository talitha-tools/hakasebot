import type {
	CommentId,
	GithubToken,
	PullNumber,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import type {
	DispatchId,
	RunUrl,
	WakeOutcome,
} from "@hakasebot/core/wake/domain.ts";
import {
	renderFailureComment,
	renderProgressComment,
} from "@hakasebot/core/wake/progress-comment.ts";

import type { SupersededWakeRow } from "#/home/wake-run-row.ts";

import type { WakeDeps, WakeHome } from "./deps.server.ts";
import { cancelSupersededRuns, pollRunUrl } from "./home-runs.server.ts";

const HOME_WORKFLOW = "home-review.yml";

export interface DispatchCtx {
	consumer: RepoRef;
	consumerToken: GithubToken;
	deps: WakeDeps;
	dispatchId: DispatchId;
	home: WakeHome;
	inputs: Record<string, string>;
	prKey: string;
	progressCommentId: CommentId | undefined;
	pullNumber: PullNumber;
	superseded: readonly SupersededWakeRow[];
}

function accepted(ctx: DispatchCtx): WakeOutcome {
	return { kind: "accepted", dispatchId: ctx.dispatchId, runUrl: undefined };
}

async function failToStart(
	ctx: DispatchCtx,
	kind: "broken" | "no-run",
	details: string,
): Promise<WakeOutcome> {
	const failureBody = renderFailureComment({
		kind,
		runUrl: undefined,
		...(details.length === 0 ? {} : { details }),
	});
	const created = await ctx.deps.github.createIssueComment({
		body: failureBody,
		pullNumber: ctx.pullNumber,
		repo: ctx.consumer,
		token: ctx.consumerToken,
	});
	if (created.kind === "ok") {
		if (ctx.progressCommentId !== undefined) {
			await ctx.deps.github.deleteIssueComment({
				commentId: ctx.progressCommentId,
				repo: ctx.consumer,
				token: ctx.consumerToken,
			});
		}
	} else if (ctx.progressCommentId !== undefined) {
		await ctx.deps.github.patchIssueComment({
			body: failureBody,
			commentId: ctx.progressCommentId,
			repo: ctx.consumer,
			token: ctx.consumerToken,
		});
	}
	await ctx.deps.store.finishWakeRun(ctx.dispatchId, "failed");
	return accepted(ctx);
}

async function finalizeStartedRun(
	ctx: DispatchCtx,
	foundRunUrl: RunUrl,
): Promise<WakeOutcome> {
	if (!(await ctx.deps.store.isWakeQueued(ctx.dispatchId))) {
		return accepted(ctx);
	}
	if (ctx.progressCommentId !== undefined) {
		await ctx.deps.github.patchIssueComment({
			body: renderProgressComment({
				prKey: ctx.prKey,
				runUrl: foundRunUrl,
				status: "started",
			}),
			commentId: ctx.progressCommentId,
			repo: ctx.consumer,
			token: ctx.consumerToken,
		});
	}
	const updated = await ctx.deps.store.updateWakeIfStatus(
		ctx.dispatchId,
		"queued",
		{
			status: "dispatched",
			runUrl: foundRunUrl,
			...(ctx.progressCommentId === undefined
				? {}
				: { progressCommentId: ctx.progressCommentId }),
		},
	);
	if (!updated) {
		return accepted(ctx);
	}
	return { kind: "accepted", dispatchId: ctx.dispatchId, runUrl: foundRunUrl };
}

async function dispatchAndPoll(args: {
	branch: string;
	createdAfterIso: string;
	ctx: DispatchCtx;
	homeToken: GithubToken;
}): Promise<WakeOutcome> {
	const { ctx } = args;
	const dispatched = await ctx.deps.github.dispatchWorkflow({
		inputs: ctx.inputs,
		ref: args.branch,
		repo: ctx.home.repo,
		token: args.homeToken,
		workflowPath: HOME_WORKFLOW,
	});
	if (dispatched.kind === "invalid") {
		return failToStart(
			ctx,
			"broken",
			"couldn't ask github to start the home workflow",
		);
	}
	if (!(await ctx.deps.store.isWakeQueued(ctx.dispatchId))) {
		return accepted(ctx);
	}
	const polled = await pollRunUrl({
		createdAfterIso: args.createdAfterIso,
		deps: ctx.deps,
		dispatchId: ctx.dispatchId,
		home: ctx.home,
	});
	if (polled.kind === "broken") {
		return failToStart(ctx, "broken", polled.details);
	}
	if (polled.kind === "missing") {
		return failToStart(
			ctx,
			"no-run",
			"asked github to start the home run, but it never showed up",
		);
	}
	return finalizeStartedRun(ctx, polled.runUrl);
}

export async function startHomeRun(ctx: DispatchCtx): Promise<WakeOutcome> {
	const homeToken = await ctx.deps.github.mint(ctx.home.installationId);
	if (homeToken.kind === "invalid") {
		return failToStart(
			ctx,
			"broken",
			"couldn't get a github app token for the home repo",
		);
	}
	if (ctx.superseded.length > 0) {
		await cancelSupersededRuns({
			deps: ctx.deps,
			home: ctx.home,
			homeToken: homeToken.value,
			superseded: ctx.superseded,
		});
	}
	if (!(await ctx.deps.store.isWakeQueued(ctx.dispatchId))) {
		return accepted(ctx);
	}
	const createdAfterIso = new Date(ctx.deps.now() - 5000).toISOString();
	const branch = await ctx.deps.github.fetchRepoDefaultBranch({
		repo: ctx.home.repo,
		token: homeToken.value,
	});
	if (branch.kind === "invalid") {
		return failToStart(
			ctx,
			"broken",
			"couldn't read the home repo default branch",
		);
	}
	if (!(await ctx.deps.store.isWakeQueued(ctx.dispatchId))) {
		return accepted(ctx);
	}
	return dispatchAndPoll({
		branch: branch.value,
		createdAfterIso,
		ctx,
		homeToken: homeToken.value,
	});
}
