import { exhaustive, reviewEventChoice } from "@hakasebot/core/domain.ts";
import type {
	Bot,
	CommentMarkdown,
	Job,
	ModelName,
	ParseResult,
	Phrases,
	RunResult,
} from "@hakasebot/core/domain.ts";
import type { RunUrl } from "@hakasebot/core/wake/domain.ts";

import type { ReviewInstructions } from "#/engines.ts";
import type { BotAuth } from "#/github-auth.ts";
import { ReviewRuntime } from "#/review-runtime.ts";
import {
	catalogViewFor,
	judgeModel,
	similarModelFailureMessage,
	similarModelNotice,
} from "#/similar-model.ts";
import type { ModelAttempt, ResolvedModelAttempt } from "#/vault/runtime.ts";
import {
	isAuthFailureMessage,
	withModelQueueFallback,
} from "#/vault/runtime.ts";

import { engineConfigFromPlaintext } from "./engine-config.ts";
import { actionInput } from "./run-config.ts";
import type { HomeRunInputs } from "./run-inputs.ts";
import type { ReviewMaterials } from "./run-materials.ts";

export interface AttemptCtx {
	auth: BotAuth;
	bot: Bot;
	consumerNotes: string | undefined;
	env: Record<string, string | undefined>;
	homeRunUrl: RunUrl | undefined;
	inputs: HomeRunInputs;
	materials: ReviewMaterials;
	phrases: Phrases | undefined;
	recheck: () => Promise<ParseResult<void>>;
	runReview:
		| ((args: { job: Job; notice?: CommentMarkdown }) => Promise<RunResult>)
		| undefined;
}

type JudgedAttempt =
	| { kind: "failed"; message: string }
	| { kind: "ok"; model: ModelName; notice: CommentMarkdown | undefined };

function judgeAttemptModel(args: {
	attempt: ResolvedModelAttempt;
	catalogs: ReviewMaterials["catalogs"];
}): JudgedAttempt {
	const verdict = judgeModel({
		catalog: catalogViewFor(args.catalogs, args.attempt.entry.engine),
		requested: args.attempt.entry.model,
		similarModel: args.attempt.entry.similarModel,
	});
	if (verdict.kind === "unresolved") {
		return { kind: "failed", message: similarModelFailureMessage(verdict) };
	}
	const notice =
		verdict.kind === "substituted"
			? similarModelNotice({
					requested: verdict.requested,
					used: verdict.model,
				})
			: undefined;
	return { kind: "ok", model: verdict.model, notice };
}

/** Engine config + Job for one queue attempt; invalid inputs throw to retry. */
function attemptJob(args: {
	attempt: ResolvedModelAttempt;
	ctx: AttemptCtx;
	model: ModelName;
}): { instructions: ReviewInstructions; job: Job } {
	const engine = engineConfigFromPlaintext({
		effort: args.attempt.entry.effort,
		fast: args.attempt.entry.fast,
		kind: args.attempt.entry.engine,
		model: args.model,
		plaintext: args.attempt.plaintext,
	});
	if (engine.kind === "invalid") {
		throw new Error(engine.message);
	}
	const reviewEvent = reviewEventChoice(
		actionInput(args.ctx.env, "review_event") ?? "auto",
	);
	if (reviewEvent.kind === "invalid") {
		throw new Error(reviewEvent.message);
	}
	const { materials } = args.ctx;
	const instructions: ReviewInstructions = {
		...(materials.dashboardPrompt === undefined
			? {}
			: { prompt: materials.dashboardPrompt }),
		...(materials.ignorePaths === undefined
			? {}
			: { ignorePaths: materials.ignorePaths }),
		...(args.ctx.consumerNotes === undefined
			? {}
			: { consumerNotes: args.ctx.consumerNotes }),
	};
	const job: Job = {
		dryRun: actionInput(args.ctx.env, "dry_run") === "true",
		engine: engine.value,
		failOnFindings: actionInput(args.ctx.env, "fail_on_findings") === "true",
		phrases: args.ctx.phrases,
		bot: args.ctx.bot,
		repo: args.ctx.inputs.consumer,
		reviewEvent: reviewEvent.value,
	};
	return { instructions, job };
}

function defaultRunReview(args: {
	ctx: AttemptCtx;
	instructions: ReviewInstructions;
}): (current: { job: Job; notice?: CommentMarkdown }) => Promise<RunResult> {
	return async (current) =>
		ReviewRuntime.run({
			auth: args.ctx.auth,
			beforePost: args.ctx.recheck,
			...(Object.keys(args.instructions).length === 0
				? {}
				: { instructions: args.instructions }),
			job: current.job,
			trigger: args.ctx.inputs.plan,
			...(current.notice === undefined ? {} : { notice: current.notice }),
			...(args.ctx.homeRunUrl === undefined
				? {}
				: { runLink: args.ctx.homeRunUrl }),
		});
}

/** Auth-shaped failures throw so the model queue falls back to the next slot. */
function reviewAttemptRunner(
	ctx: AttemptCtx,
): (attempt: ResolvedModelAttempt) => Promise<RunResult> {
	return async (attempt) => {
		const judged = judgeAttemptModel({
			attempt,
			catalogs: ctx.materials.catalogs,
		});
		if (judged.kind === "failed") {
			return judged;
		}
		const { instructions, job } = attemptJob({
			attempt,
			ctx,
			model: judged.model,
		});
		const run = ctx.runReview ?? defaultRunReview({ ctx, instructions });
		const result = await run({
			job,
			...(judged.notice === undefined ? {} : { notice: judged.notice }),
		});
		if (result.kind === "failed" && isAuthFailureMessage(result.message)) {
			throw new Error(result.message);
		}
		if (result.kind === "reseed") {
			throw new Error(result.message);
		}
		switch (result.kind) {
			case "dry-run":
			case "failed":
			case "posted":
			case "skipped-unchanged": {
				return result;
			}
			default: {
				return exhaustive(result);
			}
		}
	};
}

export async function runReviewQueue(
	ctx: AttemptCtx,
): Promise<ModelAttempt<RunResult>> {
	return withModelQueueFallback<RunResult>({
		credentialVault: ctx.materials.vault,
		encryptionKey: ctx.materials.key,
		isRetryable: (error: unknown) =>
			isAuthFailureMessage(
				error instanceof Error ? error.message : String(error),
			),
		queue: ctx.materials.queue,
		run: reviewAttemptRunner(ctx),
	});
}
