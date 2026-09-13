import type {
	CommentMarkdown,
	CommitSha,
	GithubToken,
	Job,
	ParseResult,
	Plan,
	PullNumber,
	ReviewReport,
	RunResult,
	Trigger,
} from "@hakasebot/core/domain.ts";
import { listPullFiles } from "@hakasebot/core/github-api.server.ts";
import {
	decideReviewEvent,
	mergeAxisReports,
} from "@hakasebot/core/review.server.ts";
import type { RunUrl } from "@hakasebot/core/wake/domain.ts";

import type { ReviewInstructions } from "./engines.ts";
import { runEnginePass } from "./engines.ts";
import type { BotAuth } from "./github-auth.ts";
import { botAuth } from "./github-auth.ts";
import type { PriorReviewContext } from "./incremental-review.ts";
import {
	applyReportChecks,
	commentableLinesFromPullFiles,
} from "./report-checks.ts";
import type { ResolvedReviewContext } from "./review-context.ts";
import { reviewContext } from "./review-context.ts";
import { reconcileAndPost } from "./review-post.ts";

async function reportFromEngine(args: {
	commentBody?: string;
	engine: Job["engine"];
	instructions?: ReviewInstructions;
	plan: Plan;
	priorReview?: PriorReviewContext;
}): Promise<
	| { kind: "ok"; report: ReviewReport }
	| { kind: "reseed"; engine: "codex" | "grok"; message: string }
	| { kind: "failed"; message: string }
> {
	const passArgs = {
		engine: args.engine,
		plan: args.plan,
		...(args.priorReview === undefined
			? {}
			: { priorReview: args.priorReview }),
		...(args.commentBody === undefined
			? {}
			: { commentBody: args.commentBody }),
		...(args.instructions === undefined
			? {}
			: { instructions: args.instructions }),
	};
	if (args.plan.kind === "review") {
		const [standardsPass, specPass] = await Promise.all([
			runEnginePass({ ...passArgs, axis: "standards" }),
			runEnginePass({ ...passArgs, axis: "spec" }),
		]);
		if (standardsPass.kind === "reseed" || standardsPass.kind === "failed") {
			return standardsPass;
		}
		if (specPass.kind === "reseed" || specPass.kind === "failed") {
			return specPass;
		}
		return {
			kind: "ok",
			report: mergeAxisReports({
				standards: standardsPass.report,
				spec: specPass.report,
			}),
		};
	}
	const enginePass = await runEnginePass(passArgs);
	if (enginePass.kind === "reseed" || enginePass.kind === "failed") {
		return enginePass;
	}
	return { kind: "ok", report: enginePass.report };
}

/** Drop engine findings the Review runtime cannot post on this pull. */
async function checkedReport(args: {
	checkoutRoot: string;
	engineReport: ReviewReport;
	ignorePaths: readonly string[] | undefined;
	pullNumber: PullNumber;
	repo: Job["repo"];
	token: GithubToken;
}): Promise<ReviewReport> {
	const listedFiles = await listPullFiles({
		repo: args.repo,
		pullNumber: args.pullNumber,
		token: args.token,
	});
	const commentableLines =
		listedFiles.kind === "ok"
			? commentableLinesFromPullFiles(listedFiles.value)
			: undefined;
	return applyReportChecks({
		report: args.engineReport,
		checkoutRoot: args.checkoutRoot,
		...(args.ignorePaths === undefined
			? {}
			: { ignorePaths: args.ignorePaths }),
		...(commentableLines === undefined ? {} : { commentableLines }),
	});
}

/** Engine passes plus post-checks; anything not "ok" propagates as-is. */
async function producedReport(args: {
	context: ResolvedReviewContext;
	instructions: ReviewInstructions | undefined;
	job: Job;
	token: GithubToken;
	trigger: Trigger;
}): Promise<
	| { kind: "ok"; report: ReviewReport }
	| { kind: "reseed"; engine: "codex" | "grok"; message: string }
	| { kind: "failed"; message: string }
> {
	const engineReport = await reportFromEngine({
		engine: args.job.engine,
		plan: args.trigger,
		...(args.context.priorReview === undefined
			? {}
			: { priorReview: args.context.priorReview }),
		...(args.context.commentBody === undefined
			? {}
			: { commentBody: args.context.commentBody }),
		...(args.instructions === undefined
			? {}
			: { instructions: args.instructions }),
	});
	if (engineReport.kind !== "ok") {
		return engineReport;
	}
	const report = await checkedReport({
		checkoutRoot: args.context.checkoutRoot,
		engineReport: engineReport.report,
		ignorePaths: args.instructions?.ignorePaths,
		pullNumber: args.trigger.pullNumber,
		repo: args.job.repo,
		token: args.token,
	});
	return { kind: "ok", report };
}

/** Decide the review event, run the beforePost gate, then post. */
async function finalizeAndPost(args: {
	auth: BotAuth;
	beforePost: (() => Promise<ParseResult<void>>) | undefined;
	job: Job;
	notice: CommentMarkdown | undefined;
	report: ReviewReport;
	runLink: RunUrl | undefined;
	sha: CommitSha;
	trigger: Trigger;
}): Promise<RunResult> {
	const event = decideReviewEvent({
		requested: args.job.reviewEvent,
		report: args.report,
	});
	if (args.beforePost !== undefined) {
		const gate = await args.beforePost();
		if (gate.kind === "invalid") {
			return { kind: "failed", message: gate.message };
		}
	}
	return reconcileAndPost({
		auth: args.auth,
		dryRun: args.job.dryRun,
		engine: args.job.engine.kind,
		event,
		pullNumber: args.trigger.pullNumber,
		repo: args.job.repo,
		report: args.report,
		sha: args.sha,
		...(args.notice === undefined ? {} : { notice: args.notice }),
		...(args.runLink === undefined ? {} : { runLink: args.runLink }),
	});
}

export const ReviewRuntime = {
	async run(args: {
		auth?: BotAuth;
		beforePost?: () => Promise<ParseResult<void>>;
		instructions?: ReviewInstructions;
		job: Job;
		notice?: CommentMarkdown;
		runLink?: RunUrl;
		trigger: Trigger;
	}): Promise<RunResult> {
		const auth = args.auth ?? botAuth(args.job.bot);
		const tokenResult = await auth.fresh();
		if (tokenResult.kind === "invalid") {
			return { kind: "failed", message: tokenResult.message };
		}
		const context = await reviewContext({
			job: args.job,
			trigger: args.trigger,
			token: tokenResult.value,
		});
		if (context.kind === "invalid") {
			return { kind: "failed", message: context.message };
		}
		const produced = await producedReport({
			context: context.value,
			instructions: args.instructions,
			job: args.job,
			token: tokenResult.value,
			trigger: args.trigger,
		});
		if (produced.kind !== "ok") {
			return produced;
		}
		return finalizeAndPost({
			auth,
			beforePost: args.beforePost,
			job: args.job,
			notice: args.notice,
			report: produced.report,
			runLink: args.runLink,
			sha: context.value.sha,
			trigger: args.trigger,
		});
	},
};
