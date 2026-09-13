import { createAppDb } from "@hakasebot/core/db/client.ts";
import {
	commentId,
	commitSha,
	githubAppInstallationId,
	githubToken,
	pullNumber,
} from "@hakasebot/core/domain.ts";
import {
	defaultAutoAuthors,
	defaultAutoBranches,
	defaultAutoReviewCadence,
	dispatchId,
	runUrl,
	wakeKeyFor,
} from "@hakasebot/core/wake/domain.ts";
import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { sha256HmacHex } from "@hakasebot/test-kit/helpers/hmac.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { unusedDependency } from "@hakasebot/test-kit/helpers/unused-dependency.ts";
import { expect, test } from "vitest";

import { readWebhookReceipt } from "#/wake/webhook-receipt.ts";
import type { WebhookReceipt } from "#/wake/webhook-receipt.ts";
import { handleGithubWake } from "#/wake/webhook.server.ts";
import type { WakeGithub, WakeStore } from "#/wake/webhook.server.ts";

const SECRET = "hook-secret";
const consumer = testRepoRef("talitha-tools/demo", "900001");
const home = testRepoRef("talitha-tools/review-home", "900010");
const oncePerPrWakeKey = wakeKeyFor({
	autoReviewCadence: "once-per-pr",
	consumer,
	headSha: undefined,
	plan: { kind: "review", pullNumber: must(pullNumber(4)) },
});

function consumerRepository() {
	return {
		default_branch: "main",
		id: Number(consumer.id),
		name: consumer.name,
		owner: { login: consumer.owner },
	};
}

function consumerRepositoryWithoutDefaultBranch() {
	const repository = consumerRepository();
	Reflect.deleteProperty(repository, "default_branch");
	return repository;
}

function wakeGithub(overrides: Partial<WakeGithub> = {}): WakeGithub {
	return {
		cancelWorkflowRun: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		createIssueComment: async () => {
			await Promise.resolve();
			return commentId(11);
		},
		deleteIssueComment: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		dispatchWorkflow: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		fetchPullHeadSha: async () => {
			await Promise.resolve();
			return commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
		},
		fetchRepoDefaultBranch: async () => {
			await Promise.resolve();
			return { kind: "ok", value: "main" };
		},
		findWorkflowRunByName: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: "https://github.com/talitha-tools/review-home/actions/runs/5",
			};
		},
		listIssueComments: async () => {
			await Promise.resolve();
			return { kind: "ok", value: [] };
		},
		mint: async () => {
			await Promise.resolve();
			return githubToken("ghs_test");
		},
		patchIssueComment: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		...overrides,
	};
}

async function signedRequest(
	payload: unknown,
	eventName = "pull_request",
): Promise<Request> {
	const raw = JSON.stringify(payload);
	const digest = await sha256HmacHex(SECRET, raw);
	return new Request("https://lab.example/api/github-webhook", {
		body: raw,
		headers: {
			"x-github-event": eventName,
			"x-hub-signature-256": `sha256=${digest}`,
		},
		method: "POST",
	});
}

async function ignoreWebhookReceipt(_receipt: WebhookReceipt): Promise<void> {
	await Promise.resolve();
}

function wakeStore(overrides: Partial<WakeStore>): WakeStore {
	return {
		clearInstallationIfMatches: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		disableRepo: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		findAutoWakeForPr: async () => {
			await Promise.resolve();
			return;
		},
		finishWakeRun: async () => {
			await Promise.resolve();
			return true;
		},
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					enabled: false,
					generation: undefined,
					home: undefined,
					autoAuthors: defaultAutoAuthors(),
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		getWakeStatus: async () => {
			await Promise.resolve();
			return;
		},
		isWakeQueued: async () => {
			await Promise.resolve();
			return true;
		},
		insertWake: async () => {
			await Promise.resolve();
			return "inserted";
		},
		repoHasModelSlots: async () => {
			await Promise.resolve();
			return { kind: "ok", value: true };
		},
		releaseByInstallationId: async () => {
			await Promise.resolve();
			return { kind: "ok", value: [] };
		},
		releaseReposByInstallationId: async () => {
			await Promise.resolve();
			return { kind: "ok", value: [] };
		},
		setBotInstallation: async (args) => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					claimedAt: 0,
					generation: 0,
					githubUserId: "1",
					botInstallationId: args.installationId,
					repo: args.repo,
				},
			};
		},
		supersedeInFlightReviewWakes: async () => {
			await Promise.resolve();
			return [];
		},
		updateWake: async () => {
			await Promise.resolve();
		},
		updateWakeIfStatus: async () => {
			await Promise.resolve();
			return true;
		},
		...overrides,
	};
}

test("readWebhookReceipt rejects an unknown stored outcome", async () => {
	const db = memoryD1();
	await db
		.prepare(
			`INSERT INTO webhook_receipts (id, received_at, event_name, outcome)
       VALUES (1, ?, 'pull_request', 'mystery')`,
		)
		.bind(1_700_000_000_000)
		.run();
	await expect(readWebhookReceipt(createAppDb(db))).rejects.toThrow(
		"webhook receipt outcome is invalid",
	);
});

test("handleGithubWake rejects a bad signature", async () => {
	const receipts: WebhookReceipt[] = [];
	const outcome = await handleGithubWake(
		new Request("https://lab.example/api/github-webhook", {
			body: '{"action":"deleted","installation":{"id":7}}',
			headers: {
				"x-github-event": "installation",
				"x-hub-signature-256": "sha256=deadbeef",
			},
			method: "POST",
		}),
		{
			github: unusedDependency<WakeGithub>("github"),
			now: () => 0,
			randomBytes: () => new Uint8Array(16),
			recordWebhookReceipt: async (receipt) => {
				await Promise.resolve();
				receipts.push(receipt);
			},
			sleep: async () => {
				await Promise.resolve();
			},
			store: unusedDependency<WakeStore>("store"),
			webhookSecret: SECRET,
		},
	);
	expect(outcome).toEqual({ kind: "rejected", message: "bad signature" });
	expect(receipts).toEqual([]);
});

test("handleGithubWake rejects invalid json", async () => {
	const raw = "{";
	const digest = await sha256HmacHex(SECRET, raw);
	const outcome = await handleGithubWake(
		new Request("https://lab.example/api/github-webhook", {
			body: raw,
			headers: {
				"x-github-event": "pull_request",
				"x-hub-signature-256": `sha256=${digest}`,
			},
			method: "POST",
		}),
		{
			github: unusedDependency<WakeGithub>("github"),
			now: () => 0,
			randomBytes: () => new Uint8Array(16),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store: unusedDependency<WakeStore>("store"),
			webhookSecret: SECRET,
		},
	);
	expect(outcome).toEqual({ kind: "rejected", message: "invalid json" });
});

test("handleGithubWake records an ignored verified event", async () => {
	const receipts: WebhookReceipt[] = [];
	const outcome = await handleGithubWake(
		await signedRequest({ action: "created" }, "installation"),
		{
			github: unusedDependency<WakeGithub>("github"),
			now: () => 1_700_000_000_000,
			randomBytes: () => new Uint8Array(16),
			recordWebhookReceipt: async (receipt) => {
				await Promise.resolve();
				receipts.push(receipt);
			},
			sleep: async () => {
				await Promise.resolve();
			},
			store: unusedDependency<WakeStore>("store"),
			webhookSecret: SECRET,
		},
	);

	expect(outcome).toEqual({
		kind: "ignored",
		reason: { kind: "unsupported" },
	});
	expect(receipts).toEqual([
		{
			eventName: "installation",
			outcome: "ignored",
			receivedAt: 1_700_000_000_000,
		},
	]);
});

test("handleGithubWake ignores a signed lifecycle event with a bad installation id", async () => {
	const outcome = await handleGithubWake(
		await signedRequest(
			{
				action: "deleted",
				installation: { id: "bad" },
			},
			"installation",
		),
		{
			github: unusedDependency<WakeGithub>("github"),
			now: () => 0,
			randomBytes: () => new Uint8Array(16),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store: wakeStore({}),
			webhookSecret: SECRET,
		},
	);

	expect(outcome).toEqual({
		kind: "ignored",
		reason: { kind: "unsupported" },
	});
});

test("handleGithubWake releases only repositories removed from an installation", async () => {
	const removed = consumer;
	const disabled: string[] = [];
	const store = wakeStore({
		disableRepo: async (args) => {
			await Promise.resolve();
			disabled.push(
				`${args.githubUserId}:${args.repo.owner}/${args.repo.name}`,
			);
			return { kind: "ok", value: undefined };
		},
		releaseReposByInstallationId: async (args) => {
			await Promise.resolve();
			expect(args).toEqual({
				installationId: "7",
				repos: [removed],
			});
			return {
				kind: "ok",
				value: [{ githubUserId: "1", repo: removed }],
			};
		},
	});

	const outcome = await handleGithubWake(
		await signedRequest(
			{
				action: "removed",
				installation: { id: 7 },
				repositories_removed: [
					{
						full_name: "talitha-tools/demo",
						id: Number(consumer.id),
						name: "demo",
					},
				],
			},
			"installation_repositories",
		),
		{
			github: unusedDependency<WakeGithub>("github"),
			now: () => 0,
			randomBytes: () => new Uint8Array(16),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);

	expect(outcome).toEqual({
		kind: "handled",
		lifecycle: "repositories-removed",
		releasedRepoCount: 1,
	});
	expect(disabled).toEqual(["1:talitha-tools/demo"]);
});

test("handleGithubWake releases an uninstalled app and clears its Home", async () => {
	const first = consumer;
	const second = testRepoRef("talitha-tools/other", "900002");
	const disabled: string[] = [];
	const cleared: string[] = [];
	const store = wakeStore({
		clearInstallationIfMatches: async (args) => {
			await Promise.resolve();
			cleared.push(args.installationId);
			return { kind: "ok", value: undefined };
		},
		disableRepo: async (args) => {
			await Promise.resolve();
			disabled.push(
				`${args.githubUserId}:${args.repo.owner}/${args.repo.name}`,
			);
			return { kind: "ok", value: undefined };
		},
		releaseByInstallationId: async (args) => {
			await Promise.resolve();
			expect(args.installationId).toBe("7");
			return {
				kind: "ok",
				value: [
					{ githubUserId: "1", repo: first },
					{ githubUserId: "2", repo: second },
				],
			};
		},
	});

	const outcome = await handleGithubWake(
		await signedRequest(
			{
				action: "deleted",
				installation: { id: 7 },
			},
			"installation",
		),
		{
			github: unusedDependency<WakeGithub>("github"),
			now: () => 0,
			randomBytes: () => new Uint8Array(16),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);

	expect(outcome).toEqual({
		kind: "handled",
		lifecycle: "deleted",
		releasedRepoCount: 2,
	});
	expect(disabled).toEqual(["1:talitha-tools/demo", "2:talitha-tools/other"]);
	expect(cleared).toEqual(["7"]);
});

test("handleGithubWake backfills a claimed but disabled Wake route", async () => {
	const botInstallations: string[] = [];
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					enabled: false,
					generation: 11,
					home: undefined,
					autoAuthors: defaultAutoAuthors(),
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		setBotInstallation: async (args) => {
			await Promise.resolve();
			botInstallations.push(args.installationId);
			return {
				kind: "ok",
				value: {
					claimedAt: 0,
					generation: 11,
					githubUserId: "1",
					botInstallationId: args.installationId,
					repo: args.repo,
				},
			};
		},
	});

	const outcome = await handleGithubWake(
		await signedRequest(
			{
				action: "created",
				comment: { body: "not a review request", id: 1 },
				installation: { id: 8 },
				issue: { number: 3, pull_request: {} },
				repository: consumerRepository(),
				sender: { type: "User" },
			},
			"issue_comment",
		),
		{
			github: unusedDependency<WakeGithub>("github"),
			now: () => 0,
			randomBytes: () => new Uint8Array(16),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);

	expect(outcome).toEqual({ kind: "ignored", reason: { kind: "no-plan" } });
	expect(botInstallations).toEqual(["8"]);
});

test("handleGithubWake dispatches once and posts a progress comment", async () => {
	const keys = new Set<string>();
	const comments: string[] = [];
	const dispatches: Record<string, string>[] = [];
	const botInstallations: string[] = [];
	const insertedGithubUserIds: (string | undefined)[] = [];
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		insertWake: async (row) => {
			await Promise.resolve();
			insertedGithubUserIds.push(row.githubUserId);
			if (keys.has(row.key)) {
				return "duplicate";
			}
			keys.add(row.key);
			return "inserted";
		},
		setBotInstallation: async (args) => {
			await Promise.resolve();
			botInstallations.push(args.installationId);
			return {
				kind: "ok",
				value: {
					claimedAt: 0,
					generation: 11,
					githubUserId: "1",
					botInstallationId: args.installationId,
					repo: args.repo,
				},
			};
		},
		updateWake: async () => {
			await Promise.resolve();
		},
	});
	const github: WakeGithub = {
		cancelWorkflowRun: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		createIssueComment: async (args) => {
			await Promise.resolve();
			comments.push(args.body);
			return commentId(11);
		},
		dispatchWorkflow: async (args) => {
			await Promise.resolve();
			dispatches.push(args.inputs);
			return { kind: "ok", value: undefined };
		},
		fetchPullHeadSha: async () => {
			await Promise.resolve();
			return commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
		},
		fetchRepoDefaultBranch: async () => {
			await Promise.resolve();
			return { kind: "ok", value: "main" };
		},
		findWorkflowRunByName: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: "https://github.com/talitha-tools/review-home/actions/runs/5",
			};
		},
		listIssueComments: async () => {
			await Promise.resolve();
			return { kind: "ok", value: [] };
		},
		mint: async () => {
			await Promise.resolve();
			return githubToken("ghs_test");
		},
		deleteIssueComment: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		patchIssueComment: async (args) => {
			await Promise.resolve();
			comments.push(args.body);
			return { kind: "ok", value: undefined };
		},
	};
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "opened",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () =>
				Uint8Array.from({ length: 16 }, (_byte, index) => index + 1),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome.kind).toBe("accepted");
	expect(insertedGithubUserIds).toEqual(["42"]);
	expect(dispatches).toHaveLength(1);
	expect(dispatches[0]?.["target_repo"]).toBe("talitha-tools/demo");
	expect(dispatches[0]?.["consumer_repo_id"]).toBe("900001");
	expect(dispatches[0]?.["plan"]).toBe("review");
	expect(dispatches[0]?.["pull_number"]).toBe("4");
	expect(dispatches[0]?.["route_generation"]).toBe("11");
	expect(botInstallations).toEqual(["8"]);
	expect(comments.some((body) => body.includes("waking up!!"))).toBe(true);
});

test("handleGithubWake dispatches on the home default branch", async () => {
	const dispatchRefs: string[] = [];
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		insertWake: async () => {
			await Promise.resolve();
			return "inserted";
		},
		updateWake: async () => {
			await Promise.resolve();
		},
	});
	const github: WakeGithub = {
		cancelWorkflowRun: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		createIssueComment: async () => {
			await Promise.resolve();
			return commentId(11);
		},
		dispatchWorkflow: async (args) => {
			await Promise.resolve();
			dispatchRefs.push(args.ref);
			return { kind: "ok", value: undefined };
		},
		fetchPullHeadSha: async () => {
			await Promise.resolve();
			return commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
		},
		fetchRepoDefaultBranch: async () => {
			await Promise.resolve();
			return { kind: "ok", value: "trunk" };
		},
		findWorkflowRunByName: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: "https://github.com/talitha-tools/review-home/actions/runs/5",
			};
		},
		listIssueComments: async () => {
			await Promise.resolve();
			return { kind: "ok", value: [] };
		},
		mint: async () => {
			await Promise.resolve();
			return githubToken("ghs_test");
		},
		deleteIssueComment: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		patchIssueComment: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
	};
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "opened",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () =>
				Uint8Array.from({ length: 16 }, (_byte, index) => index + 1),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome.kind).toBe("accepted");
	expect(dispatchRefs).toEqual(["trunk"]);
});

test("handleGithubWake posts a new failure comment when home app token fails", async () => {
	const comments: string[] = [];
	const deleted: number[] = [];
	let mintCount = 0;
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		insertWake: async () => {
			await Promise.resolve();
			return "inserted";
		},
		updateWake: async () => {
			await Promise.resolve();
		},
	});
	const github: WakeGithub = {
		cancelWorkflowRun: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		createIssueComment: async (args) => {
			await Promise.resolve();
			comments.push(args.body);
			return commentId(11 + comments.length);
		},
		dispatchWorkflow: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		fetchPullHeadSha: async () => {
			await Promise.resolve();
			return commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
		},
		fetchRepoDefaultBranch: async () => {
			await Promise.resolve();
			return { kind: "ok", value: "main" };
		},
		findWorkflowRunByName: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		listIssueComments: async () => {
			await Promise.resolve();
			return { kind: "ok", value: [] };
		},
		mint: async () => {
			mintCount += 1;
			await Promise.resolve();
			if (mintCount === 1) {
				return githubToken("ghs_test");
			}
			return { kind: "invalid", message: "installation token request failed" };
		},
		deleteIssueComment: async (args) => {
			await Promise.resolve();
			deleted.push(Number(args.commentId));
			return { kind: "ok", value: undefined };
		},
		patchIssueComment: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
	};
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "opened",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () =>
				Uint8Array.from({ length: 16 }, (_byte, index) => index + 1),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome.kind).toBe("accepted");
	expect(comments.some((body) => body.includes("waking up!!"))).toBe(true);
	expect(comments.some((body) => body.includes("aw!! it's broken!!"))).toBe(
		true,
	);
	expect(
		comments.some((body) =>
			body.includes("couldn't get a github app token for the home repo"),
		),
	).toBe(true);
	expect(deleted.length).toBe(1);
});

test("handleGithubWake posts no-run failure when Actions run never appears", async () => {
	const comments: string[] = [];
	const deleted: number[] = [];
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		insertWake: async () => {
			await Promise.resolve();
			return "inserted";
		},
		updateWake: async () => {
			await Promise.resolve();
		},
	});
	const github: WakeGithub = {
		cancelWorkflowRun: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		createIssueComment: async (args) => {
			await Promise.resolve();
			comments.push(args.body);
			return commentId(11 + comments.length);
		},
		dispatchWorkflow: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		fetchPullHeadSha: async () => {
			await Promise.resolve();
			return commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
		},
		fetchRepoDefaultBranch: async () => {
			await Promise.resolve();
			return { kind: "ok", value: "main" };
		},
		findWorkflowRunByName: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		listIssueComments: async () => {
			await Promise.resolve();
			return { kind: "ok", value: [] };
		},
		mint: async () => {
			await Promise.resolve();
			return githubToken("ghs_test");
		},
		deleteIssueComment: async (args) => {
			await Promise.resolve();
			deleted.push(Number(args.commentId));
			return { kind: "ok", value: undefined };
		},
		patchIssueComment: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
	};
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "opened",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () =>
				Uint8Array.from({ length: 16 }, (_byte, index) => index + 1),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome.kind).toBe("accepted");
	expect(comments.some((body) => body.includes("waking up!!"))).toBe(true);
	expect(
		comments.some((body) => body.includes("aw!! the it ignored me!!")),
	).toBe(true);
	expect(
		comments.some((body) =>
			body.includes(
				"asked github to start the home run, but it never showed up",
			),
		),
	).toBe(true);
	expect(deleted.length).toBe(1);
});

test("handleGithubWake returns unavailable when consumer app token fails", async () => {
	let inserted = 0;
	let dispatched = 0;
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		insertWake: async () => {
			inserted += 1;
			await Promise.resolve();
			return "inserted";
		},
		updateWake: async () => {
			await Promise.resolve();
		},
	});
	const github: WakeGithub = {
		cancelWorkflowRun: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		createIssueComment: async () => {
			await Promise.resolve();
			return commentId(11);
		},
		dispatchWorkflow: async () => {
			dispatched += 1;
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		fetchPullHeadSha: async () => {
			await Promise.resolve();
			return commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
		},
		fetchRepoDefaultBranch: async () => {
			await Promise.resolve();
			return { kind: "ok", value: "main" };
		},
		findWorkflowRunByName: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		listIssueComments: async () => {
			await Promise.resolve();
			return { kind: "ok", value: [] };
		},
		mint: async () => {
			await Promise.resolve();
			return { kind: "invalid", message: "installation token request failed" };
		},
		deleteIssueComment: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		patchIssueComment: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
	};
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "opened",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () => {
				throw new Error("should not allocate a dispatch id");
			},
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome).toEqual({
		kind: "unavailable",
		message: "couldn't get a github app token for this repo",
	});
	expect(inserted).toBe(0);
	expect(dispatched).toBe(0);
});

test("handleGithubWake dispatches auto reviews that match the User when scope is you", async () => {
	let dispatched = 0;
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					autoAuthors: { scope: "you", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					userGithubUserId: "1",
					wakeMode: "auto",
				},
			};
		},
		insertWake: async () => {
			await Promise.resolve();
			return "inserted";
		},
		updateWake: async () => {
			await Promise.resolve();
		},
	});
	const github: WakeGithub = {
		cancelWorkflowRun: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		createIssueComment: async () => {
			await Promise.resolve();
			return commentId(11);
		},
		dispatchWorkflow: async () => {
			dispatched += 1;
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		fetchPullHeadSha: async () => {
			await Promise.resolve();
			return commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
		},
		fetchRepoDefaultBranch: async () => {
			await Promise.resolve();
			return { kind: "ok", value: "main" };
		},
		findWorkflowRunByName: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: "https://github.com/talitha-tools/review-home/actions/runs/5",
			};
		},
		listIssueComments: async () => {
			await Promise.resolve();
			return { kind: "ok", value: [] };
		},
		mint: async () => {
			await Promise.resolve();
			return githubToken("ghs_test");
		},
		deleteIssueComment: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		patchIssueComment: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
	};
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "opened",
			installation: { id: 8 },
			pull_request: {
				author_association: "OWNER",
				base: { ref: "main" },
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () =>
				Uint8Array.from({ length: 16 }, (_byte, index) => index + 1),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome.kind).toBe("accepted");
	expect(dispatched).toBe(1);
});

test("handleGithubWake ignores auto reviews that are not the User when scope is you", async () => {
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					autoAuthors: { scope: "you", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					enabled: true,
					generation: undefined,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					userGithubUserId: "1",
					wakeMode: "auto",
				},
			};
		},
	});
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "opened",
			installation: { id: 8 },
			pull_request: {
				author_association: "OWNER",
				base: { ref: "main" },
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 4,
				user: { id: 99, login: "stranger" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github: unusedDependency<WakeGithub>("github"),
			now: () => 0,
			randomBytes: () => new Uint8Array(16),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome).toEqual({
		kind: "ignored",
		reason: { kind: "auto-authors" },
	});
});

test("handleGithubWake skips once-per-pr synchronize when a prior auto wake is active", async () => {
	const store = wakeStore({
		findAutoWakeForPr: async () => {
			await Promise.resolve();
			return {
				dispatchId: must(dispatchId("prior-dispatch")),
				status: "dispatched",
				wakeKey: oncePerPrWakeKey,
			};
		},
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: "once-per-pr",
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
	});
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "synchronize",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github: unusedDependency<WakeGithub>("github"),
			now: () => 0,
			randomBytes: () => new Uint8Array(16),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome.kind).toBe("duplicate");
});

test("handleGithubWake retries once-per-pr after a failed auto wake", async () => {
	let dispatched = 0;
	let replaced = false;
	const store = wakeStore({
		findAutoWakeForPr: async () => {
			await Promise.resolve();
			return {
				dispatchId: must(dispatchId("prior-dispatch")),
				status: "failed",
				wakeKey: oncePerPrWakeKey,
			};
		},
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: "once-per-pr",
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		insertWake: async (row) => {
			await Promise.resolve();
			replaced = row.replace === true;
			return "inserted";
		},
	});
	const github = wakeGithub({
		dispatchWorkflow: async () => {
			await Promise.resolve();
			dispatched += 1;
			return { kind: "ok", value: undefined };
		},
		fetchPullHeadSha: async () => {
			await Promise.resolve();
			return commitSha("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
		},
		findWorkflowRunByName: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: "https://github.com/talitha-tools/review-home/actions/runs/6",
			};
		},
	});
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "synchronize",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () =>
				Uint8Array.from({ length: 16 }, (_byte, index) => index + 1),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome.kind).toBe("accepted");
	expect(dispatched).toBe(1);
	expect(replaced).toBe(true);
});

test("handleGithubWake retries once-per-pr after a superseded auto wake", async () => {
	let dispatched = 0;
	let replaced = false;
	const store = wakeStore({
		findAutoWakeForPr: async () => {
			await Promise.resolve();
			return {
				dispatchId: must(dispatchId("prior-dispatch")),
				status: "superseded",
				wakeKey: oncePerPrWakeKey,
			};
		},
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: "once-per-pr",
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		insertWake: async (row) => {
			await Promise.resolve();
			replaced = row.replace === true;
			return "inserted";
		},
	});
	const github = wakeGithub({
		dispatchWorkflow: async () => {
			await Promise.resolve();
			dispatched += 1;
			return { kind: "ok", value: undefined };
		},
		fetchPullHeadSha: async () => {
			await Promise.resolve();
			return commitSha("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
		},
		findWorkflowRunByName: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: "https://github.com/talitha-tools/review-home/actions/runs/6",
			};
		},
	});
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "synchronize",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () =>
				Uint8Array.from({ length: 16 }, (_byte, index) => index + 1),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome.kind).toBe("accepted");
	expect(dispatched).toBe(1);
	expect(replaced).toBe(true);
});

test("handleGithubWake ignores auto reviews outside the default branch scope", async () => {
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: { scope: "default", branches: [], skipBranches: [] },
					autoReviewCadence: defaultAutoReviewCadence(),
					enabled: true,
					generation: undefined,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
	});
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "opened",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "develop" },
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github: unusedDependency<WakeGithub>("github"),
			now: () => 0,
			randomBytes: () => new Uint8Array(16),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome).toEqual({
		kind: "ignored",
		reason: { kind: "auto-branches" },
	});
});

test("handleGithubWake fetches default branch when payload omits it", async () => {
	let fetchedDefault = false;
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: { scope: "default", branches: [], skipBranches: [] },
					autoReviewCadence: defaultAutoReviewCadence(),
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		insertWake: async () => {
			await Promise.resolve();
			return "inserted";
		},
		updateWake: async () => {
			await Promise.resolve();
		},
	});
	const github: WakeGithub = {
		cancelWorkflowRun: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		createIssueComment: async () => {
			await Promise.resolve();
			return commentId(11);
		},
		dispatchWorkflow: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		fetchPullHeadSha: async () => {
			await Promise.resolve();
			return commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
		},
		fetchRepoDefaultBranch: async () => {
			await Promise.resolve();
			fetchedDefault = true;
			return { kind: "ok", value: "main" };
		},
		findWorkflowRunByName: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: "https://github.com/talitha-tools/review-home/actions/runs/5",
			};
		},
		listIssueComments: async () => {
			await Promise.resolve();
			return { kind: "ok", value: [] };
		},
		mint: async () => {
			await Promise.resolve();
			return githubToken("ghs_test");
		},
		deleteIssueComment: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		patchIssueComment: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
	};
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "opened",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepositoryWithoutDefaultBranch(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () =>
				Uint8Array.from({ length: 16 }, (_byte, index) => index + 1),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(fetchedDefault).toBe(true);
	expect(outcome.kind).toBe("accepted");
});

test("handleGithubWake ignores auto reviews outside the auto authors scope", async () => {
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					autoAuthors: { scope: "friends", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					enabled: true,
					generation: undefined,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
	});
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "opened",
			installation: { id: 8 },
			pull_request: {
				author_association: "NONE",
				base: { ref: "main" },
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 4,
				user: { login: "stranger" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github: unusedDependency<WakeGithub>("github"),
			now: () => 0,
			randomBytes: () => new Uint8Array(16),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome).toEqual({
		kind: "ignored",
		reason: { kind: "auto-authors" },
	});
});

test("handleGithubWake cancels an in-flight review when a newer commit wakes", async () => {
	const cancelledRunIds: string[] = [];
	const dispatches: Record<string, string>[] = [];
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		supersedeInFlightReviewWakes: async () => {
			await Promise.resolve();
			return [
				{
					createdAt: 1_700_000_000_000,
					dispatchId: must(dispatchId("old-dispatch-id")),
					runUrl: must(
						runUrl(
							"https://github.com/talitha-tools/review-home/actions/runs/99",
						),
					),
				},
			];
		},
	});
	const github = wakeGithub({
		cancelWorkflowRun: async (args) => {
			await Promise.resolve();
			cancelledRunIds.push(args.runId);
			return { kind: "ok", value: undefined };
		},
		dispatchWorkflow: async (args) => {
			await Promise.resolve();
			dispatches.push(args.inputs);
			return { kind: "ok", value: undefined };
		},
		fetchPullHeadSha: async () => {
			await Promise.resolve();
			return commitSha("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
		},
		findWorkflowRunByName: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: "https://github.com/talitha-tools/review-home/actions/runs/6",
			};
		},
	});
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "synchronize",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () =>
				Uint8Array.from({ length: 16 }, (_byte, index) => index + 1),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome.kind).toBe("accepted");
	expect(cancelledRunIds).toEqual(["99"]);
	expect(dispatches).toHaveLength(1);
});

test("handleGithubWake cancels a superseded run by dispatch name when run url is missing", async () => {
	const cancelledRunIds: string[] = [];
	const lookedUpRuns: string[] = [];
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		supersedeInFlightReviewWakes: async () => {
			await Promise.resolve();
			return [
				{
					createdAt: 1_700_000_000_000,
					dispatchId: must(dispatchId("old-dispatch-id")),
					runUrl: undefined,
				},
			];
		},
	});
	const github = wakeGithub({
		cancelWorkflowRun: async (args) => {
			await Promise.resolve();
			cancelledRunIds.push(args.runId);
			return { kind: "ok", value: undefined };
		},
		findWorkflowRunByName: async (args) => {
			await Promise.resolve();
			lookedUpRuns.push(args.runName);
			return {
				kind: "ok",
				value: "https://github.com/talitha-tools/review-home/actions/runs/77",
			};
		},
		fetchPullHeadSha: async () => {
			await Promise.resolve();
			return commitSha("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
		},
	});
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "synchronize",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () =>
				Uint8Array.from({ length: 16 }, (_byte, index) => index + 1),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome.kind).toBe("accepted");
	expect(lookedUpRuns).toContain("home-old-dispatch-id");
	expect(cancelledRunIds).toEqual(["77"]);
});

test("handleGithubWake skips dispatch when superseded before workflow start", async () => {
	const dispatches: Record<string, string>[] = [];
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		isWakeQueued: async () => {
			await Promise.resolve();
			return false;
		},
	});
	const github = wakeGithub({
		dispatchWorkflow: async (args) => {
			await Promise.resolve();
			dispatches.push(args.inputs);
			return { kind: "ok", value: undefined };
		},
		fetchPullHeadSha: async () => {
			await Promise.resolve();
			return commitSha("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
		},
		findWorkflowRunByName: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
	});
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "synchronize",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () =>
				Uint8Array.from({ length: 16 }, (_byte, index) => index + 1),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	const anyString: unknown = expect.any(String);
	expect(outcome).toEqual({
		dispatchId: anyString,
		kind: "accepted",
		runUrl: undefined,
	});
	expect(dispatches).toHaveLength(0);
});

test("handleGithubWake refuses without looking when the repo has no model slots", async () => {
	const comments: string[] = [];
	const dispatches: Record<string, string>[] = [];
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					userGithubUserId: "42",
					wakeMode: "auto",
				},
			};
		},
		repoHasModelSlots: async () => {
			await Promise.resolve();
			return { kind: "ok", value: false };
		},
	});
	const github = wakeGithub({
		createIssueComment: async (args) => {
			await Promise.resolve();
			comments.push(args.body);
			return commentId(11);
		},
		dispatchWorkflow: async (args) => {
			await Promise.resolve();
			dispatches.push(args.inputs);
			return { kind: "ok", value: undefined };
		},
	});
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "opened",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () =>
				Uint8Array.from({ length: 16 }, (_byte, index) => index + 1),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome).toEqual({
		kind: "ignored",
		reason: { kind: "no-model-slots" },
	});
	expect(dispatches).toHaveLength(0);
	expect(comments).toHaveLength(1);
	expect(comments[0]).toContain("aw!! no brains configured!!");
	expect(comments.some((body) => body.includes("looking!!"))).toBe(false);
	expect(comments.some((body) => body.includes("waking up!!"))).toBe(false);
});

test("handleGithubWake fails closed when the route has no github user id", async () => {
	const comments: string[] = [];
	const dispatches: Record<string, string>[] = [];
	const store = wakeStore({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					enabled: true,
					generation: 11,
					home: {
						installationId: must(githubAppInstallationId("2")),
						repo: home,
					},
					autoAuthors: { scope: "everyone", skipLogins: [] },
					autoBranches: defaultAutoBranches(),
					autoReviewCadence: defaultAutoReviewCadence(),
					wakeMode: "auto",
				},
			};
		},
	});
	const github = wakeGithub({
		createIssueComment: async (args) => {
			await Promise.resolve();
			comments.push(args.body);
			return commentId(11);
		},
		dispatchWorkflow: async (args) => {
			await Promise.resolve();
			dispatches.push(args.inputs);
			return { kind: "ok", value: undefined };
		},
	});
	const outcome = await handleGithubWake(
		await signedRequest({
			action: "opened",
			installation: { id: 8 },
			pull_request: {
				base: { ref: "main" },
				head: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
				number: 4,
				user: { id: 1, login: "thea" },
			},
			repository: consumerRepository(),
			sender: { type: "User" },
		}),
		{
			github,
			now: () => 1_700_000_000_000,
			randomBytes: () =>
				Uint8Array.from({ length: 16 }, (_byte, index) => index + 1),
			recordWebhookReceipt: ignoreWebhookReceipt,
			sleep: async () => {
				await Promise.resolve();
			},
			store,
			webhookSecret: SECRET,
		},
	);
	expect(outcome).toEqual({
		kind: "unavailable",
		message: "couldn't resolve model slots for this wake",
	});
	expect(dispatches).toHaveLength(0);
	expect(comments).toHaveLength(0);
});
