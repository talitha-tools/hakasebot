import { createAppDb } from "@hakasebot/core/db/client.ts";
import type { ParseResult } from "@hakasebot/core/domain.ts";
import { errorMessage } from "@hakasebot/core/error-message.ts";
import type { GithubAppWebhookSettings } from "@hakasebot/core/github-api.server.ts";
import { fetchGithubAppWebhookSettings } from "@hakasebot/core/github-api.server.ts";
import { isD1Database } from "@hakasebot/core/vault/store.ts";

import type { DeploymentConfig, HostedBotApp } from "#/deployment-config.ts";
import { deploymentConfig, env } from "#/env.ts";
import { m as msg } from "#/paraglide/messages.js";
import type { WebhookReceipt } from "#/wake/webhook-receipt.ts";
import { readWebhookReceipt } from "#/wake/webhook-receipt.ts";

import type {
	HostConsoleSnapshot,
	HostDeploymentStatus,
	HostHealthStatus,
	HostInstanceStats,
	WebhookSettingCheck,
} from "./domain.ts";
import {
	checkSubscribeEvents,
	checkWebhookUrl,
	DEFAULT_APP_WEBHOOK_EVENTS,
	SUBSCRIBE_WEBHOOK_EVENTS,
	webhookUrlFromLabUrl,
} from "./domain.ts";

export type { HostConsoleSnapshot } from "./domain.ts";

export interface HostConsoleD1Like {
	prepare: (query: string) => {
		bind: (...values: unknown[]) => {
			first: <T>() => Promise<T | null>;
		};
		first: <T>() => Promise<T | null>;
	};
}

function isHostConsoleD1Like(value: unknown): value is HostConsoleD1Like {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	return "prepare" in value && typeof value.prepare === "function";
}

function emptyStats(): HostInstanceStats {
	return {
		enabledRepoCount: 0,
		userCount: 0,
		modelSlotCount: 0,
		vaultAccountCount: 0,
	};
}

function uncheckedWebhook(): {
	eventsCheck: WebhookSettingCheck;
	urlCheck: WebhookSettingCheck;
} {
	return {
		eventsCheck: { kind: "unchecked" },
		urlCheck: { kind: "unchecked" },
	};
}

function webhookCheckFromParse<T>(
	parsed: ParseResult<T>,
	onOk: (value: T) => WebhookSettingCheck,
): WebhookSettingCheck {
	if (parsed.kind === "invalid") {
		return { kind: "error", message: parsed.message };
	}
	return onOk(parsed.value);
}

function webhookChecksFromGithub(args: {
	expectedUrl: string;
	github: GithubAppWebhookSettings;
}): {
	eventsCheck: WebhookSettingCheck;
	urlCheck: WebhookSettingCheck;
} {
	return {
		eventsCheck: webhookCheckFromParse(
			args.github.events,
			checkSubscribeEvents,
		),
		urlCheck: webhookCheckFromParse(args.github.url, (githubUrl) =>
			checkWebhookUrl(args.expectedUrl, githubUrl),
		),
	};
}

type ConfiguredHostedBot = Extract<HostedBotApp, { kind: "configured" }>;

type ReadGithubAppWebhook = (
	app: ConfiguredHostedBot,
) => GithubAppWebhookSettings | Promise<GithubAppWebhookSettings>;

async function readGithubAppWebhook(
	app: ConfiguredHostedBot,
	readWebhook: ReadGithubAppWebhook | undefined,
): Promise<GithubAppWebhookSettings> {
	try {
		if (readWebhook !== undefined) {
			return await readWebhook(app);
		}
		return await fetchGithubAppWebhookSettings({
			appId: app.clientId,
			privateKey: app.privateKey,
		});
	} catch (error: unknown) {
		const invalid = {
			kind: "invalid" as const,
			message: errorMessage(error, msg.host_webhook_read_failed()),
		};
		return { events: invalid, url: invalid };
	}
}

function readHostedAppClientIdConfigured(): boolean {
	const clientId = env.HOSTED_APP_CLIENT_ID;
	return clientId !== undefined && clientId.trim() !== "";
}

function readWebhookSecretConfigured(): boolean {
	const secret = env.HOSTED_APP_WEBHOOK_SECRET;
	return typeof secret === "string" && secret.length > 0;
}

function readDeploymentStatus(args: {
	config: DeploymentConfig;
	githubWebhook: GithubAppWebhookSettings | undefined;
	lastReceipt: WebhookReceipt | undefined;
	readHostedAppClientId?: (() => boolean) | undefined;
	readWebhookConfigured?: (() => boolean) | undefined;
}): HostDeploymentStatus {
	const hostedBot =
		args.config.hostedBotApp.kind === "configured"
			? { kind: "configured" as const, slug: args.config.hostedBotApp.slug }
			: { kind: "unset" as const };
	const clientIdConfigured =
		args.readHostedAppClientId?.() ?? readHostedAppClientIdConfigured();
	const url = webhookUrlFromLabUrl(args.config.lab.url);
	const checks =
		args.githubWebhook === undefined
			? uncheckedWebhook()
			: webhookChecksFromGithub({
					expectedUrl: url,
					github: args.githubWebhook,
				});
	return {
		actionRef: args.config.actionRef,
		hostedBot,
		lab: args.config.lab,
		hostedAppSignIn: { clientIdConfigured },
		webhook: {
			configured:
				args.readWebhookConfigured?.() ?? readWebhookSecretConfigured(),
			eventsCheck: checks.eventsCheck,
			lastReceipt: args.lastReceipt,
			subscribeEvents: SUBSCRIBE_WEBHOOK_EVENTS,
			defaultAppEvents: DEFAULT_APP_WEBHOOK_EVENTS,
			url,
			urlCheck: checks.urlCheck,
		},
	};
}

async function readD1(): Promise<HostConsoleD1Like | undefined> {
	try {
		const workers: unknown = await import("cloudflare:workers");
		if (
			typeof workers !== "object" ||
			workers === null ||
			!("env" in workers)
		) {
			return undefined;
		}
		const workersEnv = workers.env;
		if (typeof workersEnv !== "object" || workersEnv === null) {
			return undefined;
		}
		if (!("DB" in workersEnv)) {
			return undefined;
		}
		if (!isHostConsoleD1Like(workersEnv.DB)) {
			return undefined;
		}
		return workersEnv.DB;
	} catch {
		return undefined;
	}
}

async function readD1Health(db: HostConsoleD1Like): Promise<HostHealthStatus> {
	try {
		const ping = await db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
		if (ping === null || ping === undefined) {
			return {
				d1: { kind: "error", message: msg.host_d1_ping_empty() },
			};
		}
		let migrationCount = 0;
		try {
			const row = await db
				.prepare("SELECT COUNT(*) AS count FROM d1_migrations")
				.first<{ count: number }>();
			migrationCount = row?.count ?? 0;
		} catch {
			migrationCount = 0;
		}
		return {
			d1: { kind: "ok", migrationCount },
		};
	} catch (error: unknown) {
		return {
			d1: {
				kind: "error",
				message: errorMessage(error, msg.host_d1_health_failed()),
			},
		};
	}
}

async function countTable(
	db: HostConsoleD1Like,
	table: string,
): Promise<number> {
	try {
		const row = await db
			.prepare(`SELECT COUNT(*) AS count FROM ${table}`)
			.first<{ count: number }>();
		return row?.count ?? 0;
	} catch {
		return 0;
	}
}

async function readInstanceStats(
	db: HostConsoleD1Like,
): Promise<HostInstanceStats> {
	const vaultAccountCount = await countTable(db, "vault_accounts");
	const modelSlotCount = await countTable(db, "model_slots");
	const enabledRepoCount = await countTable(db, "enabled_repos");
	const userCount = await countTable(db, "encryption_key_meta");

	return {
		enabledRepoCount,
		userCount,
		modelSlotCount,
		vaultAccountCount,
	};
}

async function readLastWebhookReceipt(
	db: HostConsoleD1Like,
): Promise<WebhookReceipt | undefined> {
	try {
		if (!isD1Database(db)) {
			return undefined;
		}
		return await readWebhookReceipt(createAppDb(db));
	} catch {
		return undefined;
	}
}

export async function readHostConsoleSnapshot(args?: {
	db?: HostConsoleD1Like | undefined;
	readConfig?: () => DeploymentConfig;
	readGithubAppWebhook?: ReadGithubAppWebhook;
	readHostedAppClientId?: () => boolean;
	readWebhookConfigured?: () => boolean;
}): Promise<HostConsoleSnapshot> {
	const config = (args?.readConfig ?? deploymentConfig)();
	const db = args?.db ?? (await readD1());
	const lastReceipt =
		db === undefined ? undefined : await readLastWebhookReceipt(db);
	const githubWebhook =
		config.hostedBotApp.kind === "configured"
			? await readGithubAppWebhook(
					config.hostedBotApp,
					args?.readGithubAppWebhook,
				)
			: undefined;
	const deployment = readDeploymentStatus({
		config,
		githubWebhook,
		lastReceipt,
		readHostedAppClientId: args?.readHostedAppClientId,
		readWebhookConfigured: args?.readWebhookConfigured,
	});
	if (db === undefined) {
		return {
			deployment,
			health: {
				d1: { kind: "error", message: msg.host_d1_unbound() },
			},
			stats: emptyStats(),
		};
	}

	const health = await readD1Health(db);
	const stats = await readInstanceStats(db);

	return {
		deployment,
		health,
		stats,
	};
}
