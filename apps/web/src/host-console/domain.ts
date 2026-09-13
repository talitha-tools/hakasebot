import type { WebhookReceipt } from "#/wake/webhook-receipt.ts";

export const SUBSCRIBE_WEBHOOK_EVENTS = [
	"pull_request",
	"issue_comment",
	"pull_request_review_comment",
] as const;

export const DEFAULT_APP_WEBHOOK_EVENTS = [
	"installation",
	"installation_repositories",
] as const;

export function webhookUrlFromLabUrl(labUrl: string): string {
	return `${labUrl.replace(/\/+$/u, "")}/api/github-webhook`;
}

export type WebhookSettingCheck =
	| { kind: "unchecked" }
	| { kind: "match" }
	| { kind: "mismatch"; detail: string }
	| { kind: "error"; message: string };

function urlPathname(url: URL): string {
	return url.pathname.replace(/\/+$/u, "");
}

export function webhookUrlsMatch(expected: string, actual: string): boolean {
	try {
		const left = new URL(expected);
		const right = new URL(actual);
		return (
			left.protocol === right.protocol &&
			left.host === right.host &&
			urlPathname(left) === urlPathname(right) &&
			left.search === right.search
		);
	} catch {
		return expected.replace(/\/+$/u, "") === actual.replace(/\/+$/u, "");
	}
}

export function missingSubscribeEvents(
	githubEvents: readonly string[],
): string[] {
	const have = new Set(githubEvents);
	return SUBSCRIBE_WEBHOOK_EVENTS.filter((eventName) => !have.has(eventName));
}

export function checkWebhookUrl(
	expected: string,
	githubUrl: string,
): WebhookSettingCheck {
	if (webhookUrlsMatch(expected, githubUrl)) {
		return { kind: "match" };
	}
	return { kind: "mismatch", detail: githubUrl };
}

export function checkSubscribeEvents(
	githubEvents: readonly string[],
): WebhookSettingCheck {
	const missing = missingSubscribeEvents(githubEvents);
	if (missing.length === 0) {
		return { kind: "match" };
	}
	return { kind: "mismatch", detail: missing.join(", ") };
}

export function webhookSettingTicked(check: WebhookSettingCheck): boolean {
	return check.kind === "match";
}

export interface HostDeploymentStatus {
	actionRef: string;
	hostedBot: { kind: "configured"; slug: string } | { kind: "unset" };
	lab: { sourceRepoUrl: string; url: string };
	hostedAppSignIn: { clientIdConfigured: boolean };
	webhook: {
		configured: boolean;
		eventsCheck: WebhookSettingCheck;
		lastReceipt: WebhookReceipt | undefined;
		subscribeEvents: typeof SUBSCRIBE_WEBHOOK_EVENTS;
		defaultAppEvents: typeof DEFAULT_APP_WEBHOOK_EVENTS;
		url: string;
		urlCheck: WebhookSettingCheck;
	};
}

export interface HostHealthStatus {
	d1:
		| { kind: "ok"; migrationCount: number }
		| { kind: "error"; message: string };
}

export interface HostInstanceStats {
	enabledRepoCount: number;
	userCount: number;
	modelSlotCount: number;
	vaultAccountCount: number;
}

export interface HostConsoleSnapshot {
	deployment: HostDeploymentStatus;
	health: HostHealthStatus;
	stats: HostInstanceStats;
}
