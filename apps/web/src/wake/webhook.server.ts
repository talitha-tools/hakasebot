import type {
	ParsedEvent,
	ParseResult,
	PlanResult,
} from "@hakasebot/core/domain.ts";
import {
	defaultReviewPhrases,
	planFromTrigger,
} from "@hakasebot/core/review.server.ts";
import type { WakeEvent, WakeOutcome } from "@hakasebot/core/wake/domain.ts";

import { readHostedAppSlug } from "#/env.ts";

import type { WakeDeps, WakeRoute } from "./deps.server.ts";
import type { AppLifecycleEvent } from "./parse-webhook.ts";
import { parseAppLifecycle, parseWakeEvent } from "./parse-webhook.ts";
import { processPlannedWake } from "./plan-wake.server.ts";
import { verifyGithubSignature } from "./verify-signature.ts";

export type {
	WakeDeps,
	WakeGithub,
	WakeHome,
	WakeRoute,
	WakeStore,
} from "./deps.server.ts";
export { productionWakeGithub } from "./deps.server.ts";

function planFromWakeParsed(event: ParsedEvent): PlanResult {
	if (event.kind === "pull_request") {
		return planFromTrigger({ event });
	}
	const slug = readHostedAppSlug();
	if (slug === undefined) {
		return { kind: "no_match" };
	}
	return planFromTrigger({
		event,
		phrases: defaultReviewPhrases(slug),
	});
}

async function handleAppLifecycle(
	event: AppLifecycleEvent,
	deps: WakeDeps,
): Promise<WakeOutcome> {
	const released =
		event.kind === "deleted"
			? await deps.store.releaseByInstallationId({
					installationId: event.installationId,
				})
			: await deps.store.releaseReposByInstallationId({
					installationId: event.installationId,
					repos: event.repos,
				});
	if (released.kind === "invalid") {
		return { kind: "unavailable", message: released.message };
	}
	const disabled = await Promise.all(
		released.value.map(async (item) => deps.store.disableRepo(item)),
	);
	for (const result of disabled) {
		if (result.kind === "invalid") {
			return { kind: "unavailable", message: result.message };
		}
	}
	if (event.kind === "deleted") {
		const cleared = await deps.store.clearInstallationIfMatches({
			installationId: event.installationId,
		});
		if (cleared.kind === "invalid") {
			return { kind: "unavailable", message: cleared.message };
		}
	}
	return {
		kind: "handled",
		lifecycle: event.kind,
		releasedRepoCount: released.value.length,
	};
}

async function resolveRoute(
	deps: WakeDeps,
	event: WakeEvent,
): Promise<ParseResult<WakeRoute>> {
	const foundRoute = await deps.store.findRoute(event.consumer.id);
	if (foundRoute.kind === "invalid") {
		return foundRoute;
	}
	if (foundRoute.value.generation !== undefined) {
		const backfilled = await deps.store.setBotInstallation({
			installationId: event.installationId,
			repo: event.consumer,
		});
		if (backfilled.kind === "invalid") {
			return backfilled;
		}
	}
	return foundRoute;
}

async function handleVerifiedGithubWake(
	args: { eventName: string; rawBody: string },
	deps: WakeDeps,
): Promise<WakeOutcome> {
	let payload: unknown;
	try {
		payload = JSON.parse(args.rawBody) as unknown;
	} catch {
		return { kind: "rejected", message: "invalid json" };
	}
	const lifecycle = parseAppLifecycle({ eventName: args.eventName, payload });
	if (lifecycle !== undefined) {
		if (lifecycle.kind === "invalid") {
			return { kind: "ignored", reason: { kind: "unsupported" } };
		}
		return handleAppLifecycle(lifecycle.value, deps);
	}
	const parsed = parseWakeEvent({ eventName: args.eventName, payload });
	if (parsed.kind === "ignore") {
		return { kind: "ignored", reason: parsed.reason };
	}
	const route = await resolveRoute(deps, parsed.value);
	if (route.kind === "invalid") {
		return { kind: "unavailable", message: route.message };
	}
	const planned = planFromWakeParsed(parsed.value.parsed);
	if (planned.kind === "no_match") {
		return { kind: "ignored", reason: { kind: "no-plan" } };
	}
	return processPlannedWake({
		deps,
		event: parsed.value,
		plan: planned.plan,
		route: route.value,
	});
}

export async function handleGithubWake(
	request: Request,
	deps: WakeDeps,
): Promise<WakeOutcome> {
	const rawBody = await request.text();
	if (
		!(await verifyGithubSignature({
			rawBody,
			secret: deps.webhookSecret,
			signatureHeader: request.headers.get("x-hub-signature-256"),
		}))
	) {
		return { kind: "rejected", message: "bad signature" };
	}
	const receivedAt = deps.now();
	const eventName = request.headers.get("x-github-event") ?? "";
	const outcome = await handleVerifiedGithubWake({ eventName, rawBody }, deps);
	await deps.recordWebhookReceipt({
		eventName,
		outcome: outcome.kind,
		receivedAt,
	});
	return outcome;
}
