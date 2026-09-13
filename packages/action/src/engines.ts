import path from "node:path";

import { absolutePath } from "@hakasebot/core/domain.ts";
import type {
	AbsolutePath,
	EngineConfig,
	EngineKind,
	Plan,
	ReviewReport,
} from "@hakasebot/core/domain.ts";
import { REVIEW_REPORT_FILENAME } from "@hakasebot/core/review.server.ts";

/**
 * Action-job CLI adapters. The web app cannot import this package
 * (`exports: {}`, ADR-0029). Callers use ReviewRuntime.run.
 * This module orchestrates one engine pass. Per-kind argv, credential, and
 * stdout handling live in engines/<kind>.ts.
 */
import { envValue, processEnv, workspaceRoot } from "./action-env.ts";
import { buildEngineArgv, skillsInstallArgv } from "./engine-argv.ts";
import { materializeCredentials } from "./engine-credentials.ts";
import {
	engineChildEnv,
	looksLikeAuthFailure,
	redactEngineFailureDetail,
	secretValuesForRedact,
	spawnCaptured,
} from "./engine-process.ts";
import type { ReviewAxis, ReviewInstructions } from "./engine-prompt.ts";
import { buildReviewPrompt } from "./engine-prompt.ts";
import { loadValidatedReport } from "./engine-report.ts";
import { materializeEngineScripts } from "./engine-scripts.ts";
import type { EngineJobCtx } from "./engines/job-ctx.ts";
import type { PriorReviewContext } from "./incremental-review.ts";
import { engineBinaryName, engineBinaryOverride } from "./install-registry.ts";
import type { JobHome } from "./job-home.ts";
import { createJobHome, destroyJobHome } from "./job-home.ts";

export {
	SKILLS_BIN_ENV,
	buildEngineArgv,
	skillsInstallArgv,
} from "./engine-argv.ts";
export { claudeAllowedTools, claudeSettingsJson } from "./engines/claude.ts";
export { codexConfigToml } from "./engines/codex.ts";
export type { EngineJobCtx } from "./engines/job-ctx.ts";
export {
	engineChildEnv,
	looksLikeAuthFailure,
	redactEngineFailureDetail,
} from "./engine-process.ts";
export {
	REPORT_JSON_SCHEMA,
	buildReviewPrompt,
	specReviewGuidance,
	standardsReviewGuidance,
} from "./engine-prompt.ts";
export type { ReviewAxis, ReviewInstructions } from "./engine-prompt.ts";
export { normalizeEngineStdout } from "./engine-report.ts";
export { extractJsonStdout } from "./engines/json-stdout.ts";

async function installCodeReviewSkill(args: {
	home: JobHome;
}): Promise<{ kind: "ok" } | { kind: "failed"; message: string }> {
	const argv = skillsInstallArgv();
	const [binary, ...skillsArgv] = argv;
	if (binary === undefined) {
		return { kind: "failed", message: "skills install argv is empty" };
	}
	const env = engineChildEnv({
		engineEnv: { DO_NOT_TRACK: "1" },
		home: args.home.root,
		parent: processEnv,
	});
	const spawned = await spawnCaptured({
		binary,
		argv: skillsArgv,
		cwd: args.home.root,
		env,
	});
	if (spawned.kind === "spawn-error") {
		return { kind: "failed", message: spawned.message };
	}
	if (spawned.exitCode !== 0) {
		const detail = spawned.stderr.trim() || spawned.stdout.trim();
		return {
			kind: "failed",
			message:
				detail.length > 0
					? `skills install exited ${String(spawned.exitCode)}: ${detail}`
					: `skills install exited ${String(spawned.exitCode)}`,
		};
	}
	return { kind: "ok" };
}

function engineBinary(kind: EngineKind): string {
	return engineBinaryOverride(kind, processEnv) ?? engineBinaryName(kind);
}

async function spawnEngine(args: {
	ctx: EngineJobCtx;
	cwd: AbsolutePath;
	engine: EngineConfig;
	env: Record<string, string>;
	home: JobHome;
	prompt: string;
}): Promise<
	| { kind: "ok"; stdout: string; stderr: string; exitCode: number }
	| { kind: "spawn-error"; message: string }
> {
	const binary = engineBinary(args.engine.kind);
	const argv = buildEngineArgv({
		ctx: args.ctx,
		engine: args.engine,
		prompt: args.prompt,
	});
	const childEnv = engineChildEnv({
		engineEnv: args.env,
		home: args.home.root,
		parent: processEnv,
	});
	const fakeMode = envValue("HAKASEBOT_FAKE_ENGINE_MODE");
	if (fakeMode !== undefined) {
		childEnv["HAKASEBOT_FAKE_ENGINE_MODE"] = fakeMode;
	}
	return spawnCaptured({
		binary,
		argv,
		cwd: args.cwd,
		env: childEnv,
	});
}

export type EnginePassResult =
	| { kind: "ok"; report: ReviewReport }
	| { kind: "reseed"; engine: "codex" | "grok"; message: string }
	| { kind: "failed"; message: string };

interface PreparedPass {
	ctx: EngineJobCtx;
	env: Record<string, string>;
	prompt: string;
}

async function setupEnginePass(args: {
	axis?: ReviewAxis;
	commentBody?: string;
	engine: EngineConfig;
	home: JobHome;
	instructions?: ReviewInstructions;
	plan: Plan;
	priorReview?: PriorReviewContext;
	reportPath: string;
}): Promise<
	({ kind: "ok" } & PreparedPass) | { kind: "failed"; message: string }
> {
	await materializeEngineScripts(args.home.root);
	if (args.plan.kind === "review") {
		const installed = await installCodeReviewSkill({ home: args.home });
		if (installed.kind === "failed") {
			return installed;
		}
	}
	const ctx: EngineJobCtx = { homeDir: args.home.root, plan: args.plan };
	const { env } = await materializeCredentials({
		ctx,
		engine: args.engine,
		home: args.home,
	});
	if (args.priorReview !== undefined) {
		env["REVIEW_SINCE_SHA"] = args.priorReview.sinceSha;
	}
	const prompt = buildReviewPrompt({
		plan: args.plan,
		reportPath: args.reportPath,
		homeDir: args.home.root,
		...(args.priorReview === undefined
			? {}
			: { priorReview: args.priorReview }),
		...(args.commentBody === undefined
			? {}
			: { commentBody: args.commentBody }),
		...(args.instructions === undefined
			? {}
			: { instructions: args.instructions }),
		...(args.axis === undefined ? {} : { axis: args.axis }),
	});
	return { kind: "ok", ctx, env, prompt };
}

function engineFailureResult(args: {
	engine: EngineConfig;
	env: Record<string, string>;
	spawned: { stdout: string; stderr: string; exitCode: number };
}): EnginePassResult | undefined {
	const { engine, spawned } = args;
	if (
		(engine.kind === "codex" || engine.kind === "grok") &&
		looksLikeAuthFailure({
			engine: engine.kind,
			exitCode: spawned.exitCode,
			stderr: spawned.stderr,
			stdout: spawned.stdout,
		})
	) {
		return {
			kind: "reseed",
			engine: engine.kind,
			message: `${engine.kind} login flopped. paste a fresh one in the lab and copy the key again.`,
		};
	}
	if (spawned.exitCode === 0) {
		return undefined;
	}
	const raw = spawned.stderr.trim() || spawned.stdout.trim();
	const detail = redactEngineFailureDetail({
		detail: raw,
		secrets: secretValuesForRedact({
			credential: engine.credential,
			env: args.env,
		}),
	});
	return {
		kind: "failed",
		message:
			detail.length > 0
				? `engine exited ${String(spawned.exitCode)}: ${detail}`
				: `engine exited ${String(spawned.exitCode)}`,
	};
}

async function executePass(args: {
	cwd: AbsolutePath;
	engine: EngineConfig;
	home: JobHome;
	reportPath: string;
	setup: PreparedPass;
}): Promise<EnginePassResult> {
	const spawned = await spawnEngine({
		ctx: args.setup.ctx,
		cwd: args.cwd,
		engine: args.engine,
		env: args.setup.env,
		home: args.home,
		prompt: args.setup.prompt,
	});
	if (spawned.kind === "spawn-error") {
		return { kind: "failed", message: spawned.message };
	}
	const failure = engineFailureResult({
		engine: args.engine,
		env: args.setup.env,
		spawned,
	});
	if (failure !== undefined) {
		return failure;
	}
	const loaded = await loadValidatedReport({
		engine: args.engine.kind,
		reportPath: args.reportPath,
		stdout: spawned.stdout,
	});
	if (loaded.kind === "invalid") {
		return { kind: "failed", message: loaded.message };
	}
	return { kind: "ok", report: loaded.value };
}

/**
 * Deep spawn path. Materializes credentials into a job-local HOME, runs the
 * engine, then deletes HOME. ReviewRuntime is the only caller.
 */
export async function runEnginePass(args: {
	engine: EngineConfig;
	plan: Plan;
	commentBody?: string;
	instructions?: ReviewInstructions;
	axis?: ReviewAxis;
	priorReview?: PriorReviewContext;
}): Promise<EnginePassResult> {
	const cwd = absolutePath(workspaceRoot());
	if (cwd.kind === "invalid") {
		return { kind: "failed", message: cwd.message };
	}
	const home = await createJobHome();
	const reportPath = path.join(home.root, REVIEW_REPORT_FILENAME);
	try {
		const setup = await setupEnginePass({ ...args, home, reportPath });
		if (setup.kind === "failed") {
			return setup;
		}
		return await executePass({
			cwd: cwd.value,
			engine: args.engine,
			home,
			reportPath,
			setup,
		});
	} finally {
		await destroyJobHome(home);
	}
}
