import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
	catalogModel,
	commitSha,
	githubAppInstallationId,
	modelCatalog,
	modelName,
	pullNumber,
	reviewId,
} from "@hakasebot/core/domain.ts";
import type {
	CommentMarkdown,
	ModelName,
	RunResult,
} from "@hakasebot/core/domain.ts";
import type { HomeRuntimePack } from "@hakasebot/core/home/runtime-pack.ts";
import {
	encryptCredential,
	generateEncryptionKey,
} from "@hakasebot/core/vault/crypto.ts";
import {
	accountId,
	modelSlotId,
	VAULT_SECRET_NAMES,
} from "@hakasebot/core/vault/domain.ts";
import { dispatchId } from "@hakasebot/core/wake/domain.ts";
import { asFetch } from "@hakasebot/test-kit/helpers/as-fetch.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { expect, test } from "vitest";

import { runHomeReview } from "#/home/run-review.ts";

const consumer = testRepoRef("talitha-tools/demo", "900001");
const slotId = must(modelSlotId("slot_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
const accId = must(accountId("acc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
const sha = must(commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));

async function setupHome(args: {
	catalogIds?: readonly string[];
	model: string;
	similarModel: boolean;
}): Promise<{
	env: Record<string, string | undefined>;
	pack: HomeRuntimePack;
	workDir: string;
}> {
	const dir = await mkdtemp(path.join(os.tmpdir(), "similar-model-"));
	const key = generateEncryptionKey();
	const sealed = await encryptCredential({
		accountId: accId,
		plaintext: "sk-ant-test-token",
		encryptionKey: key,
	});
	const model = must(modelName(args.model));
	const catalogs =
		args.catalogIds === undefined
			? {}
			: {
					claude: must(
						modelCatalog({
							engine: "claude",
							models: args.catalogIds.map((id) =>
								must(catalogModel({ displayName: id, id })),
							),
						}),
					),
				};
	return {
		env: {
			INPUT_GITHUB_TOKEN: "ghs_test",
			INPUT_TRIGGER_PHRASE: "@hakasebot",
			[VAULT_SECRET_NAMES.encryptionKey]: key,
			VITE_LAB_URL: "https://lab.example",
		},
		pack: {
			catalogs,
			prefs: {
				repos: [
					{
						repo: consumer,
						slotIds: [slotId],
					},
				],
				slots: [
					{
						accountId: accId,
						createdAt: 1,
						defaultSortIndex: 0,
						engine: "claude",
						fast: false,
						id: slotId,
						label: "opus",
						model,
						similarModel: args.similarModel,
					},
				],
				version: 1,
			},
			vault: { accounts: [sealed], version: 1 },
			version: 1,
		},
		workDir: dir,
	};
}

async function runCase(args: {
	catalogIds?: readonly string[];
	model: string;
	similarModel: boolean;
}): Promise<{
	jobs: { model: ModelName; notice: CommentMarkdown | undefined }[];
	result: RunResult;
}> {
	const home = await setupHome({
		...(args.catalogIds === undefined ? {} : { catalogIds: args.catalogIds }),
		model: args.model,
		similarModel: args.similarModel,
	});
	const jobs: { model: ModelName; notice: CommentMarkdown | undefined }[] = [];
	const result = await runHomeReview({
		claimHold: async () => {
			await Promise.resolve();
			return { kind: "holds" };
		},
		clone: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		consumerDir: path.join(home.workDir, "consumer"),
		dispatchHold: async () => {
			await Promise.resolve();
			return { kind: "active" };
		},
		env: home.env,
		fetchImpl: asFetch(async () => {
			await Promise.resolve();
			return Response.json({});
		}),
		fetchRuntimePack: async () => {
			await Promise.resolve();
			return { kind: "ok", value: home.pack };
		},
		inputs: {
			commentId: undefined,
			consumer,
			dispatchId: must(dispatchId("abc123def4567890")),
			headSha: sha,
			installationId: must(githubAppInstallationId("2")),
			plan: { kind: "review", pullNumber: must(pullNumber(4)) },
			progressCommentId: undefined,
			pullNumber: must(pullNumber(4)),
			routeGeneration: undefined,
		},
		prepare: async () => {
			await Promise.resolve();
			return { kind: "ok", installed: [] };
		},
		runReview: async (current) => {
			jobs.push({
				model: current.job.engine.model,
				notice: current.notice,
			});
			await Promise.resolve();
			return {
				findingCount: 0,
				kind: "posted",
				reviewId: must(reviewId(1)),
				sha,
			};
		},
	});
	return { jobs, result };
}

test("runHomeReview substitutes a same-family catalog successor", async () => {
	const ran = await runCase({
		catalogIds: ["claude-opus-5", "claude-sonnet-4-6"],
		model: "claude-opus-4-8",
		similarModel: true,
	});
	expect(ran.result.kind).toBe("posted");
	expect(ran.jobs).toHaveLength(1);
	expect(ran.jobs[0]?.model).toBe("claude-opus-5");
	expect(ran.jobs[0]?.notice).toBe(
		"this review used claude-opus-5 because claude-opus-4-8 went away.",
	);
});

test("runHomeReview fails and does not spawn when similar-model is off", async () => {
	const ran = await runCase({
		catalogIds: ["claude-opus-5"],
		model: "claude-opus-4-8",
		similarModel: false,
	});
	expect(ran.jobs).toEqual([]);
	expect(ran.result.kind).toBe("failed");
	if (ran.result.kind !== "failed") {
		return;
	}
	expect(ran.result.message).toContain(
		"claude-opus-4-8 went away and you said no cousins. claude-opus-5 is still around.",
	);
});

test("runHomeReview keeps the stored id when the catalog is missing", async () => {
	const ran = await runCase({
		model: "claude-opus-4-8",
		similarModel: true,
	});
	expect(ran.result.kind).toBe("posted");
	expect(ran.jobs[0]?.model).toBe("claude-opus-4-8");
	expect(ran.jobs[0]?.notice).toBeUndefined();
});
