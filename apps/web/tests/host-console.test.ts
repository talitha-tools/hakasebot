import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { fakeD1Database } from "@hakasebot/test-kit/helpers/d1.ts";
import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { memorySessionStorage } from "@hakasebot/test-kit/helpers/session-storage.ts";
import { isNotFound } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { parseDeploymentConfig } from "#/env.ts";
import {
	assertHostConsoleEnabled,
	hostConsoleEnabled,
	validateHostConsoleToken,
} from "#/host-console/auth.server.ts";
import {
	checkSubscribeEvents,
	checkWebhookUrl,
	DEFAULT_APP_WEBHOOK_EVENTS,
	SUBSCRIBE_WEBHOOK_EVENTS,
	webhookUrlsMatch,
} from "#/host-console/domain.ts";
import { ensureHostConsoleRoute } from "#/host-console/route.server.ts";
import {
	clearHostConsoleToken,
	loadHostConsoleToken,
	saveHostConsoleToken,
} from "#/host-console/session-token.ts";
import type { HostConsoleD1Like } from "#/host-console/snapshot.server.ts";
import { readHostConsoleSnapshot } from "#/host-console/snapshot.server.ts";
import { m as msg } from "#/paraglide/messages.js";
import type { WebhookReceipt } from "#/wake/webhook-receipt.ts";

const TOKEN = "operator-secret-token";

function hostedLabConfig(privateKey?: string) {
	const parsed = parseDeploymentConfig({
		actionRef: "me/fork@v2",
		hostedAppClientId: "Iv23test",
		hostedAppPrivateKey:
			privateKey ??
			"-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----",
		hostedAppSlug: "my-bot",
		labUrl: "https://lab.example/",
		sourceRepoUrl: "https://github.com/me/fork",
	});
	if (parsed.kind === "invalid") {
		throw new Error(parsed.message);
	}
	return parsed.value;
}

function okGithubWebhook(settings: { events: string[]; url: string }) {
	return {
		events: { kind: "ok" as const, value: settings.events },
		url: { kind: "ok" as const, value: settings.url },
	};
}

function createMockDb(args: {
	migrationCount: number;
	counts: Record<string, number>;
	receipt?: WebhookReceipt | undefined;
}): HostConsoleD1Like {
	const rowFor = (query: string) => {
		if (query.includes("SELECT 1")) {
			return { ok: 1 };
		}
		if (query.includes("d1_migrations")) {
			return { count: args.migrationCount };
		}
		if (query.includes("webhook_receipts")) {
			if (args.receipt === undefined) {
				throw new Error("webhook receipt is missing");
			}
			return {
				event_name: args.receipt.eventName,
				outcome: args.receipt.outcome,
				received_at: args.receipt.receivedAt,
			};
		}
		for (const [table, count] of Object.entries(args.counts)) {
			if (query.includes(`FROM ${table}`)) {
				return { count };
			}
		}
		throw new Error(`unexpected query: ${query}`);
	};
	return fakeD1Database({
		all: ({ query }) => [rowFor(query)],
		first: ({ query }) => rowFor(query),
	});
}

describe("hostConsoleEnabled", () => {
	test("is false when HOST_CONSOLE_TOKEN is unset", () => {
		expect(hostConsoleEnabled({ configuredToken: undefined })).toBe(false);
		expect(hostConsoleEnabled({ configuredToken: "" })).toBe(false);
		expect(hostConsoleEnabled({ configuredToken: "   " })).toBe(false);
	});

	test("is true when HOST_CONSOLE_TOKEN is set", () => {
		expect(hostConsoleEnabled({ configuredToken: TOKEN })).toBe(true);
	});
});

describe("validateHostConsoleToken", () => {
	test("rejects when host console is disabled", async () => {
		expect(
			await validateHostConsoleToken(undefined, { configuredToken: undefined }),
		).toEqual({
			kind: "invalid",
			message: "not found",
		});
	});

	test("rejects missing authorization", async () => {
		expect(
			await validateHostConsoleToken(undefined, { configuredToken: TOKEN }),
		).toEqual({
			kind: "invalid",
			message: msg.host_token_missing(),
		});
		expect(
			await validateHostConsoleToken("   ", { configuredToken: TOKEN }),
		).toEqual({
			kind: "invalid",
			message: msg.host_token_missing(),
		});
	});

	test("rejects wrong bearer token", async () => {
		expect(
			await validateHostConsoleToken("Bearer wrong-token", {
				configuredToken: TOKEN,
			}),
		).toEqual({
			kind: "invalid",
			message: msg.host_token_wrong(),
		});
	});

	test("accepts a matching bearer token", async () => {
		expect(
			await validateHostConsoleToken(`Bearer ${TOKEN}`, {
				configuredToken: TOKEN,
			}),
		).toEqual({ kind: "ok", value: undefined });
	});
});

describe("assertHostConsoleEnabled", () => {
	test("throws when host console is disabled", () => {
		expect(() => {
			assertHostConsoleEnabled({ configuredToken: undefined });
		}).toThrow("not found");
	});

	test("does not throw when host console is enabled", () => {
		expect(() => {
			assertHostConsoleEnabled({ configuredToken: TOKEN });
		}).not.toThrow();
	});
});

describe("ensureHostConsoleRoute", () => {
	test("throws notFound when host console is disabled", () => {
		try {
			ensureHostConsoleRoute({ configuredToken: undefined });
			expect.unreachable("expected notFound");
		} catch (error: unknown) {
			expect(isNotFound(error)).toBe(true);
		}
	});
});

describe("host console session token", () => {
	let storage: Storage;

	beforeEach(() => {
		storage = memorySessionStorage();
		Object.defineProperty(globalThis, "sessionStorage", {
			configurable: true,
			value: storage,
		});
	});

	test("round-trips token in sessionStorage", () => {
		expect(loadHostConsoleToken()).toBeUndefined();
		saveHostConsoleToken(TOKEN);
		expect(loadHostConsoleToken()).toBe(TOKEN);
		clearHostConsoleToken();
		expect(loadHostConsoleToken()).toBeUndefined();
	});
});

describe("webhook event lists", () => {
	test("subscribe events omit installation lifecycle events github sends by default", () => {
		expect([...SUBSCRIBE_WEBHOOK_EVENTS]).toEqual([
			"pull_request",
			"issue_comment",
			"pull_request_review_comment",
		]);
		expect([...DEFAULT_APP_WEBHOOK_EVENTS]).toEqual([
			"installation",
			"installation_repositories",
		]);
	});

	test("webhook url match ignores a trailing slash", () => {
		expect(
			webhookUrlsMatch(
				"https://lab.example/api/github-webhook",
				"https://lab.example/api/github-webhook/",
			),
		).toBe(true);
		expect(
			webhookUrlsMatch(
				"https://lab.example/api/github-webhook",
				"https://other.example/api/github-webhook",
			),
		).toBe(false);
		expect(
			webhookUrlsMatch(
				"https://lab.example/api/github-webhook",
				"https://lab.example/api/github-webhook?x=1",
			),
		).toBe(false);
	});

	test("subscribe event check reports missing github events", () => {
		expect(checkSubscribeEvents([...SUBSCRIBE_WEBHOOK_EVENTS])).toEqual({
			kind: "match",
		});
		expect(
			checkSubscribeEvents(["issue_comment", ...SUBSCRIBE_WEBHOOK_EVENTS]),
		).toEqual({
			kind: "match",
		});
		expect(checkSubscribeEvents(["pull_request"])).toEqual({
			kind: "mismatch",
			detail: "issue_comment, pull_request_review_comment",
		});
		expect(
			checkWebhookUrl(
				"https://lab.example/api/github-webhook",
				"https://wrong.example/hook",
			),
		).toEqual({
			kind: "mismatch",
			detail: "https://wrong.example/hook",
		});
	});
});

describe("readHostConsoleSnapshot", () => {
	let restoreFetch: (() => void) | undefined;

	afterEach(() => {
		restoreFetch?.();
		restoreFetch = undefined;
	});

	test("assembles deployment, health, and aggregate stats from mock D1", async () => {
		const snapshot = await readHostConsoleSnapshot({
			db: createMockDb({
				counts: {
					enabled_repos: 3,
					model_slots: 8,
					vault_accounts: 5,
					encryption_key_meta: 2,
				},
				migrationCount: 3,
				receipt: {
					eventName: "installation",
					outcome: "ignored",
					receivedAt: 1_700_000_000_000,
				},
			}),
			readConfig: () => hostedLabConfig(),
			readGithubAppWebhook: () =>
				okGithubWebhook({
					events: [...SUBSCRIBE_WEBHOOK_EVENTS],
					url: "https://lab.example/api/github-webhook",
				}),
			readHostedAppClientId: () => true,
			readWebhookConfigured: () => true,
		});

		expect(snapshot.deployment).toEqual({
			actionRef: "me/fork@v2",
			hostedBot: { kind: "configured", slug: "my-bot" },
			lab: {
				sourceRepoUrl: "https://github.com/me/fork",
				url: "https://lab.example/",
			},
			hostedAppSignIn: { clientIdConfigured: true },
			webhook: {
				configured: true,
				eventsCheck: { kind: "match" },
				lastReceipt: {
					eventName: "installation",
					outcome: "ignored",
					receivedAt: 1_700_000_000_000,
				},
				subscribeEvents: [
					"pull_request",
					"issue_comment",
					"pull_request_review_comment",
				],
				defaultAppEvents: ["installation", "installation_repositories"],
				url: "https://lab.example/api/github-webhook",
				urlCheck: { kind: "match" },
			},
		});
		expect(snapshot.health).toEqual({
			d1: { kind: "ok", migrationCount: 3 },
		});
		expect(snapshot.stats).toEqual({
			enabledRepoCount: 3,
			userCount: 2,
			modelSlotCount: 8,
			vaultAccountCount: 5,
		});
	});

	test("reports github webhook mismatches", async () => {
		const snapshot = await readHostConsoleSnapshot({
			db: undefined,
			readConfig: () => hostedLabConfig(),
			readGithubAppWebhook: () =>
				okGithubWebhook({
					events: ["pull_request"],
					url: "https://wrong.example/hook",
				}),
			readHostedAppClientId: () => true,
		});

		expect(snapshot.deployment.webhook.urlCheck).toEqual({
			kind: "mismatch",
			detail: "https://wrong.example/hook",
		});
		expect(snapshot.deployment.webhook.eventsCheck).toEqual({
			kind: "mismatch",
			detail: "issue_comment, pull_request_review_comment",
		});
	});

	test("ticks events when github lists extra events", async () => {
		const snapshot = await readHostConsoleSnapshot({
			db: undefined,
			readConfig: () => hostedLabConfig(),
			readGithubAppWebhook: () =>
				okGithubWebhook({
					events: [
						...SUBSCRIBE_WEBHOOK_EVENTS,
						"installation",
						"installation_repositories",
					],
					url: "https://lab.example/api/github-webhook",
				}),
			readHostedAppClientId: () => true,
		});

		expect(snapshot.deployment.webhook.eventsCheck).toEqual({
			kind: "match",
		});
		expect(snapshot.deployment.webhook.urlCheck).toEqual({ kind: "match" });
	});

	test("ticks events when the hook url fetch fails", async () => {
		const snapshot = await readHostConsoleSnapshot({
			db: undefined,
			readConfig: () => hostedLabConfig(),
			readGithubAppWebhook: () => ({
				events: {
					kind: "ok" as const,
					value: [...SUBSCRIBE_WEBHOOK_EVENTS],
				},
				url: {
					kind: "invalid" as const,
					message: "github app hook config missing url",
				},
			}),
			readHostedAppClientId: () => true,
		});

		expect(snapshot.deployment.webhook.eventsCheck).toEqual({
			kind: "match",
		});
		expect(snapshot.deployment.webhook.urlCheck).toEqual({
			kind: "error",
			message: "github app hook config missing url",
		});
	});

	test("ticks webhook url and events from live github app fetches", async () => {
		restoreFetch = installGithubFetchMock({
			getApp: () => ({
				json: {
					events: [...SUBSCRIBE_WEBHOOK_EVENTS, "installation"],
				},
			}),
			getAppHookConfig: () => ({
				json: { url: "https://lab.example/api/github-webhook" },
			}),
		});

		const snapshot = await readHostConsoleSnapshot({
			db: undefined,
			readConfig: () => hostedLabConfig(TEST_APP_PRIVATE_KEY),
			readHostedAppClientId: () => true,
		});

		expect(snapshot.deployment.webhook.urlCheck).toEqual({ kind: "match" });
		expect(snapshot.deployment.webhook.eventsCheck).toEqual({
			kind: "match",
		});
	});

	test("reports D1 error when database is not bound", async () => {
		const parsed = parseDeploymentConfig({});
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}

		const snapshot = await readHostConsoleSnapshot({
			db: undefined,
			readConfig: () => parsed.value,
			readHostedAppClientId: () => false,
			readWebhookConfigured: () => false,
		});

		expect(snapshot.deployment.hostedBot).toEqual({ kind: "unset" });
		expect(snapshot.deployment.hostedAppSignIn).toEqual({
			clientIdConfigured: false,
		});
		expect(snapshot.deployment.webhook.configured).toBe(false);
		expect(snapshot.deployment.webhook.urlCheck).toEqual({ kind: "unchecked" });
		expect(snapshot.deployment.webhook.eventsCheck).toEqual({
			kind: "unchecked",
		});
		expect(snapshot.health).toEqual({
			d1: { kind: "error", message: msg.host_d1_unbound() },
		});
		expect(snapshot.stats).toEqual({
			enabledRepoCount: 0,
			userCount: 0,
			modelSlotCount: 0,
			vaultAccountCount: 0,
		});
	});
});
