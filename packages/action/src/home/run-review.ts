import type {
	Bot,
	CommentMarkdown,
	GithubToken,
	Job,
	ParseResult,
	RunResult,
} from "@hakasebot/core/domain.ts";
import { consumerNotesFilename } from "@hakasebot/core/review.server.ts";
import type { RunUrl } from "@hakasebot/core/wake/domain.ts";

import { setGithubWorkspace } from "#/action-env.ts";
import type { ClaimHold } from "#/claim-hold.ts";
import type { BotAuth } from "#/github-auth.ts";
import { botAuth } from "#/github-auth.ts";
import { prepareEngines } from "#/install-registry.ts";
import type { DispatchHold } from "#/wake-hold.ts";

import { cloneConsumer } from "./clone-consumer.ts";
import type { fetchRuntimePack } from "./lab-client.ts";
import type { AttemptCtx } from "./run-attempt.ts";
import { runReviewQueue } from "./run-attempt.ts";
import {
	phrasesFromEnv,
	readBot,
	readWorkspaceFile,
	uniqueEngines,
} from "./run-config.ts";
import {
	clearProgress,
	failureReporter,
	holdsRecheck,
	wakeFailureMarker,
} from "./run-guards.ts";
import type { HomeRunInputs } from "./run-inputs.ts";
import type { ReviewMaterials } from "./run-materials.ts";
import { loadReviewMaterials } from "./run-materials.ts";
import { homeRunUrlFromEnv } from "./run-url.ts";

interface RunHomeReviewArgs {
	claimHold?: (args: { expectedGeneration: number }) => Promise<ClaimHold>;
	dispatchHold?: (args: {
		dispatchId: HomeRunInputs["dispatchId"];
	}) => Promise<DispatchHold>;
	clone?: typeof cloneConsumer;
	consumerDir: string;
	env: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
	fetchRuntimePack?: typeof fetchRuntimePack;
	inputs: HomeRunInputs;
	prepare?: typeof prepareEngines;
	runReview?: (args: {
		job: Job;
		notice?: CommentMarkdown;
	}) => Promise<RunResult>;
}

/** Auth, holds, and failure plumbing shared by every later phase. */
interface BootedRun {
	auth: BotAuth;
	bot: Bot;
	failProgress: (message: string) => Promise<RunResult>;
	homeRunUrl: RunUrl | undefined;
	recheck: () => Promise<ParseResult<void>>;
	token: GithubToken;
}

async function bootRun(
	args: RunHomeReviewArgs,
): Promise<{ kind: "failed"; message: string } | ({ kind: "ok" } & BootedRun)> {
	const bot = readBot({
		env: args.env,
		installationId: args.inputs.installationId,
	});
	const markWakeFailed = wakeFailureMarker({
		dispatchId: args.inputs.dispatchId,
		env: args.env,
		...(args.fetchImpl === undefined ? {} : { fetchImpl: args.fetchImpl }),
	});
	if (bot.kind === "invalid") {
		await markWakeFailed();
		return { kind: "failed", message: bot.message };
	}
	const auth = botAuth(bot.value);
	const tokenResult = await auth.fresh();
	if (tokenResult.kind === "invalid") {
		await markWakeFailed();
		return { kind: "failed", message: tokenResult.message };
	}
	const homeRunUrl = homeRunUrlFromEnv(args.env);
	const recheck = holdsRecheck({
		...(args.claimHold === undefined ? {} : { claimHold: args.claimHold }),
		...(args.dispatchHold === undefined
			? {}
			: { dispatchHold: args.dispatchHold }),
		env: args.env,
		inputs: args.inputs,
	});
	const failProgress = failureReporter({
		auth,
		inputs: args.inputs,
		markWakeFailed,
		recheck,
		runUrl: homeRunUrl,
	});
	return {
		kind: "ok",
		auth,
		bot: bot.value,
		failProgress,
		homeRunUrl,
		recheck,
		token: tokenResult.value,
	};
}

/** Clone the consumer, read its notes, and point engine passes at it. */
async function stageCheckout(args: {
	clone: typeof cloneConsumer;
	consumerDir: string;
	env: Record<string, string | undefined>;
	inputs: HomeRunInputs;
	recheck: () => Promise<ParseResult<void>>;
	token: GithubToken;
}): Promise<
	| { kind: "invalid"; message: string }
	| { kind: "ok"; consumerNotes: string | undefined }
> {
	const cloned = await args.clone({
		dest: args.consumerDir,
		pullNumber: args.inputs.pullNumber,
		repo: args.inputs.consumer,
		sha: args.inputs.headSha,
		token: args.token,
	});
	if (cloned.kind === "invalid") {
		return cloned;
	}
	const consumerNotes = await readWorkspaceFile({
		path: consumerNotesFilename(),
		dir: args.consumerDir,
	});
	const early = await args.recheck();
	if (early.kind === "invalid") {
		return early;
	}
	args.env["GITHUB_WORKSPACE"] = args.consumerDir;
	setGithubWorkspace(args.consumerDir);
	return { kind: "ok", consumerNotes };
}

/** Load run materials and make sure their engines are installed. */
async function provisionEngines(
	request: RunHomeReviewArgs,
): Promise<ParseResult<ReviewMaterials>> {
	const materials = await loadReviewMaterials({
		env: request.env,
		...(request.fetchImpl === undefined
			? {}
			: { fetchImpl: request.fetchImpl }),
		...(request.fetchRuntimePack === undefined
			? {}
			: { fetchRuntimePack: request.fetchRuntimePack }),
		inputs: request.inputs,
	});
	if (materials.kind === "invalid") {
		return materials;
	}
	const prepared = await (request.prepare ?? prepareEngines)({
		engines: uniqueEngines(
			materials.value.queue.entries.map((entry) => entry.engine),
		),
		env: request.env,
	});
	if (prepared.kind === "invalid") {
		return prepared;
	}
	return materials;
}

/** Everything between boot and the model queue: phrases, engines, checkout. */
async function prepareRun(args: {
	boot: BootedRun;
	request: RunHomeReviewArgs;
}): Promise<ParseResult<AttemptCtx>> {
	const phrases = phrasesFromEnv(args.request.env);
	if (phrases.kind === "invalid") {
		return phrases;
	}
	const materials = await provisionEngines(args.request);
	if (materials.kind === "invalid") {
		return materials;
	}
	const staged = await stageCheckout({
		clone: args.request.clone ?? cloneConsumer,
		consumerDir: args.request.consumerDir,
		env: args.request.env,
		inputs: args.request.inputs,
		recheck: args.boot.recheck,
		token: args.boot.token,
	});
	if (staged.kind === "invalid") {
		return staged;
	}
	return {
		kind: "ok",
		value: {
			auth: args.boot.auth,
			bot: args.boot.bot,
			consumerNotes: staged.consumerNotes,
			env: args.request.env,
			homeRunUrl: args.boot.homeRunUrl,
			inputs: args.request.inputs,
			materials: materials.value,
			phrases: phrases.value,
			recheck: args.boot.recheck,
			runReview: args.request.runReview,
		},
	};
}

async function settleRun(args: {
	auth: BotAuth;
	failProgress: (message: string) => Promise<RunResult>;
	inputs: HomeRunInputs;
	recheck: () => Promise<ParseResult<void>>;
	result: RunResult;
}): Promise<RunResult> {
	const late = await args.recheck();
	if (late.kind === "invalid") {
		return args.failProgress(late.message);
	}
	const { result } = args;
	if (result.kind === "failed") {
		return args.failProgress(result.message);
	}
	if (
		result.kind === "posted" ||
		result.kind === "skipped-unchanged" ||
		result.kind === "dry-run"
	) {
		const cleared = await clearProgress({
			auth: args.auth,
			inputs: args.inputs,
		});
		if (cleared.kind === "invalid") {
			return {
				kind: "failed",
				message: `review finished but progress comment stayed: ${cleared.message}`,
			};
		}
	}
	return result;
}

export async function runHomeReview(
	args: RunHomeReviewArgs,
): Promise<RunResult> {
	const boot = await bootRun(args);
	if (boot.kind === "failed") {
		return boot;
	}
	const prepared = await prepareRun({ boot, request: args });
	if (prepared.kind === "invalid") {
		return boot.failProgress(prepared.message);
	}
	const attempted = await runReviewQueue(prepared.value);
	if (attempted.kind === "exhausted") {
		return boot.failProgress(attempted.message);
	}
	return settleRun({
		auth: boot.auth,
		failProgress: boot.failProgress,
		inputs: args.inputs,
		recheck: boot.recheck,
		result: attempted.value,
	});
}
