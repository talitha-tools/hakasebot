import { exhaustive } from "@hakasebot/core/domain.ts";
import type { ParseResult, RunResult } from "@hakasebot/core/domain.ts";
import {
	createIssueComment,
	deleteIssueComment,
} from "@hakasebot/core/github-api.server.ts";
import { NO_MODEL_SLOTS_MESSAGE } from "@hakasebot/core/home/runtime-pack.ts";
import type { RunUrl } from "@hakasebot/core/wake/domain.ts";
import { renderFailureComment } from "@hakasebot/core/wake/progress-comment.ts";

import type { ClaimHold } from "#/claim-hold.ts";
import { claimStillHolds } from "#/claim-hold.ts";
import type { BotAuth } from "#/github-auth.ts";
import type { DispatchHold } from "#/wake-hold.ts";
import { dispatchStillActive } from "#/wake-hold.ts";

import { reportWakeStatus } from "./lab-client.ts";
import type { HomeRunInputs } from "./run-inputs.ts";

export function wakeFailureMarker(args: {
	dispatchId: HomeRunInputs["dispatchId"];
	env: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
}): () => Promise<void> {
	return async () => {
		await reportWakeStatus({
			dispatchId: args.dispatchId,
			env: args.env,
			...(args.fetchImpl === undefined ? {} : { fetchImpl: args.fetchImpl }),
			status: "failed",
		});
	};
}

function dispatchHoldResult(hold: DispatchHold): ParseResult<void> {
	switch (hold.kind) {
		case "active": {
			return { kind: "ok", value: undefined };
		}
		case "superseded": {
			return {
				kind: "invalid",
				message: "dispatch superseded. this run will not post",
			};
		}
		case "inactive": {
			return {
				kind: "invalid",
				message: "dispatch inactive. this run will not post",
			};
		}
		case "unknown": {
			return {
				kind: "invalid",
				message: "dispatch hold unknown. this run will not post",
			};
		}
		default: {
			return exhaustive(hold);
		}
	}
}

function claimHoldResult(hold: ClaimHold): ParseResult<void> {
	switch (hold.kind) {
		case "holds": {
			return { kind: "ok", value: undefined };
		}
		case "moved": {
			return {
				kind: "invalid",
				message: "claim moved. this run will not post",
			};
		}
		case "unknown": {
			return {
				kind: "invalid",
				message: "claim hold unknown. this run will not post",
			};
		}
		default: {
			return exhaustive(hold);
		}
	}
}

/**
 * Re-verifies the dispatch and the repo claim before any posting step; a
 * non-active dispatch or a moved/unknown claim means this run must not post.
 */
export function holdsRecheck(args: {
	claimHold?: (args: { expectedGeneration: number }) => Promise<ClaimHold>;
	dispatchHold?: (args: {
		dispatchId: HomeRunInputs["dispatchId"];
	}) => Promise<DispatchHold>;
	env: Record<string, string | undefined>;
	inputs: HomeRunInputs;
}): () => Promise<ParseResult<void>> {
	return async () => {
		const wakeHoldFn =
			args.dispatchHold ??
			(async (holdArgs: { dispatchId: HomeRunInputs["dispatchId"] }) =>
				dispatchStillActive({
					dispatchId: holdArgs.dispatchId,
					env: args.env,
				}));
		const dispatchGate = dispatchHoldResult(
			await wakeHoldFn({
				dispatchId: args.inputs.dispatchId,
			}),
		);
		if (dispatchGate.kind === "invalid") {
			return dispatchGate;
		}
		if (args.inputs.routeGeneration === undefined) {
			return { kind: "ok", value: undefined };
		}
		const holdFn =
			args.claimHold ??
			(async (holdArgs: { expectedGeneration: number }) =>
				claimStillHolds({
					consumer: args.inputs.consumer,
					env: args.env,
					expectedGeneration: holdArgs.expectedGeneration,
				}));
		return claimHoldResult(
			await holdFn({
				expectedGeneration: args.inputs.routeGeneration,
			}),
		);
	};
}

export async function clearProgress(args: {
	auth: BotAuth;
	inputs: HomeRunInputs;
}): Promise<ParseResult<void>> {
	if (args.inputs.progressCommentId === undefined) {
		return { kind: "ok", value: undefined };
	}
	const token = await args.auth.fresh();
	if (token.kind === "invalid") {
		return token;
	}
	return deleteIssueComment({
		commentId: args.inputs.progressCommentId,
		repo: args.inputs.consumer,
		token: token.value,
	});
}

async function postFailureOutcome(args: {
	auth: BotAuth;
	details?: string;
	inputs: HomeRunInputs;
	kind: "failed" | "no-model-slots";
	runUrl: RunUrl | undefined;
}): Promise<ParseResult<void>> {
	const token = await args.auth.fresh();
	if (token.kind === "invalid") {
		return token;
	}
	const created = await createIssueComment({
		body: renderFailureComment({
			kind: args.kind,
			runUrl: args.runUrl,
			...(args.details === undefined ? {} : { details: args.details }),
		}),
		pullNumber: args.inputs.pullNumber,
		repo: args.inputs.consumer,
		token: token.value,
	});
	if (created.kind === "invalid") {
		return created;
	}
	return clearProgress({ auth: args.auth, inputs: args.inputs });
}

export function failureCommentKindForMessage(
	message: string,
): "failed" | "no-model-slots" {
	return message === NO_MODEL_SLOTS_MESSAGE ? "no-model-slots" : "failed";
}

/**
 * Failure path: recheck holds, post the failure comment, mark the wake
 * dispatch failed, and surface the original message.
 */
export function failureReporter(args: {
	auth: BotAuth;
	inputs: HomeRunInputs;
	markWakeFailed: () => Promise<void>;
	recheck: () => Promise<ParseResult<void>>;
	runUrl: RunUrl | undefined;
}): (message: string) => Promise<RunResult> {
	return async (message) => {
		const gate = await args.recheck();
		if (gate.kind === "invalid") {
			return { kind: "failed", message: gate.message };
		}
		const kind = failureCommentKindForMessage(message);
		const posted = await postFailureOutcome({
			auth: args.auth,
			inputs: args.inputs,
			kind,
			runUrl: args.runUrl,
			...(kind === "no-model-slots" ? {} : { details: message }),
		});
		await args.markWakeFailed();
		if (posted.kind === "invalid") {
			return {
				kind: "failed",
				message: `${message}; also could not post failure comment: ${posted.message}`,
			};
		}
		return { kind: "failed", message };
	};
}
