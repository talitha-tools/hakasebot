import { createAppDb } from "@hakasebot/core/db/client.ts";
import type { WakeOutcome } from "@hakasebot/core/wake/domain.ts";

import { deploymentConfig, env } from "#/env.ts";
import { createHomeStore, d1FromWorkerEnv } from "#/home/store.ts";
import { writeWebhookReceipt } from "#/wake/webhook-receipt.ts";
import {
	handleGithubWake,
	productionWakeGithub,
} from "#/wake/webhook.server.ts";

async function delay(ms: number): Promise<void> {
	const { promise, resolve } = Promise.withResolvers<undefined>();
	setTimeout(() => {
		resolve(undefined);
	}, ms);
	await promise;
}

function statusFor(outcome: WakeOutcome): number {
	if (outcome.kind === "rejected") {
		return 401;
	}
	if (outcome.kind === "unavailable") {
		return 503;
	}
	return 202;
}

export async function handleGithubWakeRequest(
	request: Request,
): Promise<Response> {
	const webhookSecret = env.HOSTED_APP_WEBHOOK_SECRET;
	if (webhookSecret === undefined || webhookSecret.length === 0) {
		return Response.json(
			{ error: "webhook is not configured", ok: false },
			{ status: 503 },
		);
	}
	const config = deploymentConfig();
	if (config.hostedBotApp.kind !== "configured") {
		return Response.json({ kind: "ignored" }, { status: 202 });
	}
	const db = await d1FromWorkerEnv();
	if (db === undefined) {
		return Response.json(
			{ error: "store is not bound", ok: false },
			{ status: 503 },
		);
	}
	const outcome = await handleGithubWake(request, {
		github: productionWakeGithub({ hostedApp: config.hostedBotApp }),
		now: () => Date.now(),
		randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
		recordWebhookReceipt: async (receipt) => {
			await writeWebhookReceipt(createAppDb(db), receipt);
		},
		sleep: async (ms) => {
			await delay(ms);
		},
		store: createHomeStore(db),
		webhookSecret,
	});
	return Response.json({ kind: outcome.kind }, { status: statusFor(outcome) });
}
