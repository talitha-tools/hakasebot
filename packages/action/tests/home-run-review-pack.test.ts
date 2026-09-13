import {
	commitSha,
	githubAppInstallationId,
	modelName,
	pullNumber,
} from "@hakasebot/core/domain.ts";
import { packMac, packMacHeader } from "@hakasebot/core/home/pack-mac.ts";
import type { HomeRuntimePack } from "@hakasebot/core/home/runtime-pack.ts";
import { NO_MODEL_SLOTS_MESSAGE } from "@hakasebot/core/home/runtime-pack.ts";
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
import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { asFetch } from "@hakasebot/test-kit/helpers/as-fetch.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { expect, test } from "vitest";

import { fetchRuntimePack, reportWakeStatus } from "#/home/lab-client.ts";
import { failureCommentKindForMessage } from "#/home/run-guards.ts";
import { runHomeReview } from "#/home/run-review.ts";

const consumer = testRepoRef("talitha-tools/demo", "900001");

test("failureCommentKindForMessage maps empty slots to no-model-slots", () => {
	expect(failureCommentKindForMessage(NO_MODEL_SLOTS_MESSAGE)).toBe(
		"no-model-slots",
	);
	expect(failureCommentKindForMessage("engine timed out")).toBe("failed");
});

test("runHomeReview fails when the runtime pack is unreachable", async () => {
	const result = await runHomeReview({
		claimHold: async () => {
			await Promise.resolve();
			return { kind: "holds" };
		},
		clone: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		consumerDir: "/tmp/consumer",
		dispatchHold: async () => {
			await Promise.resolve();
			return { kind: "active" };
		},
		env: {
			INPUT_GITHUB_TOKEN: "ghs_test",
			INPUT_TRIGGER_PHRASE: "@hakasebot",
			[VAULT_SECRET_NAMES.encryptionKey]: generateEncryptionKey(),
			VITE_LAB_URL: "https://lab.example",
		},
		fetchImpl: asFetch(async () => {
			await Promise.resolve();
			return Response.json({});
		}),
		fetchRuntimePack: async () => {
			await Promise.resolve();
			return { kind: "invalid", message: "runtime pack unreachable" };
		},
		inputs: {
			commentId: undefined,
			consumer,
			dispatchId: must(dispatchId("abc123def4567890")),
			headSha: must(commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")),
			installationId: must(githubAppInstallationId("2")),
			plan: { kind: "review", pullNumber: must(pullNumber(4)) },
			progressCommentId: undefined,
			pullNumber: must(pullNumber(4)),
			routeGeneration: undefined,
		},
		runReview: async () => {
			await Promise.resolve();
			return { kind: "failed", message: "should not run" };
		},
	});
	expect(result.kind).toBe("failed");
	if (result.kind !== "failed") {
		return;
	}
	expect(result.message.startsWith("runtime pack unreachable")).toBe(true);
});

async function samplePack(): Promise<HomeRuntimePack> {
	const slot = must(modelSlotId("slot_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
	const account = must(accountId("acc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
	const sealed = await encryptCredential({
		accountId: account,
		encryptionKey: generateEncryptionKey(),
		plaintext: "sk-ant-test-token",
	});
	return {
		catalogs: {},
		prefs: {
			repos: [{ repo: consumer, slotIds: [slot] }],
			slots: [
				{
					accountId: account,
					createdAt: 1,
					defaultSortIndex: 0,
					engine: "claude",
					fast: false,
					id: slot,
					label: "opus",
					model: must(modelName("claude-opus-4")),
					similarModel: true,
				},
			],
			version: 1,
		},
		vault: { accounts: [sealed], version: 1 },
		version: 1,
	};
}

test("runHomeReview fails with no-model-slots when the pack has no model slots", async () => {
	const result = await runHomeReview({
		claimHold: async () => {
			await Promise.resolve();
			return { kind: "holds" };
		},
		clone: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		consumerDir: "/tmp/consumer",
		dispatchHold: async () => {
			await Promise.resolve();
			return { kind: "active" };
		},
		env: {
			INPUT_GITHUB_TOKEN: "ghs_test",
			INPUT_TRIGGER_PHRASE: "@hakasebot",
			[VAULT_SECRET_NAMES.encryptionKey]: generateEncryptionKey(),
			VITE_LAB_URL: "https://lab.example",
		},
		fetchRuntimePack: async () => {
			await Promise.resolve();
			return { kind: "invalid", message: NO_MODEL_SLOTS_MESSAGE };
		},
		inputs: {
			commentId: undefined,
			consumer,
			dispatchId: must(dispatchId("abc123def4567890")),
			headSha: must(commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")),
			installationId: must(githubAppInstallationId("2")),
			plan: { kind: "review", pullNumber: must(pullNumber(4)) },
			progressCommentId: undefined,
			pullNumber: must(pullNumber(4)),
			routeGeneration: undefined,
		},
		runReview: async () => {
			await Promise.resolve();
			return { kind: "failed", message: "should not run" };
		},
	});
	expect(result.kind).toBe("failed");
	if (result.kind !== "failed") {
		return;
	}
	expect(result.message.startsWith(NO_MODEL_SLOTS_MESSAGE)).toBe(true);
});

test("fetchRuntimePack fails closed when the app pem is missing", async () => {
	const result = await fetchRuntimePack({
		dispatchId: must(dispatchId("abc123def4567890")),
		env: { VITE_LAB_URL: "https://lab.example" },
		fetchImpl: asFetch(async () => {
			await Promise.resolve();
			return Response.json({});
		}),
	});
	expect(result).toEqual({
		kind: "invalid",
		message: "github app private key is missing; cannot fetch the runtime pack",
	});
});

test("fetchRuntimePack sends the pack mac header", async () => {
	const id = must(dispatchId("abc123def4567890"));
	const pack = await samplePack();
	const expected = packMacHeader(
		await packMac({ dispatchId: id, pem: TEST_APP_PRIVATE_KEY }),
	);
	let authorization: string | undefined;
	const result = await fetchRuntimePack({
		dispatchId: id,
		env: {
			INPUT_GITHUB_APP_PRIVATE_KEY: TEST_APP_PRIVATE_KEY,
			VITE_LAB_URL: "https://lab.example",
		},
		fetchImpl: asFetch(async (input, init) => {
			authorization =
				new Request(input, init).headers.get("authorization") ?? undefined;
			await Promise.resolve();
			return Response.json(pack);
		}),
	});
	expect(authorization).toBe(expected);
	expect(result).toEqual({ kind: "ok", value: pack });
});

test("fetchRuntimePack surfaces no-model-slots errors from the pack body", async () => {
	const id = must(dispatchId("abc123def4567890"));
	const result = await fetchRuntimePack({
		dispatchId: id,
		env: {
			INPUT_GITHUB_APP_PRIVATE_KEY: TEST_APP_PRIVATE_KEY,
			VITE_LAB_URL: "https://lab.example",
		},
		fetchImpl: asFetch(async () => {
			await Promise.resolve();
			return Response.json({ error: NO_MODEL_SLOTS_MESSAGE }, { status: 500 });
		}),
	});
	expect(result).toEqual({
		kind: "invalid",
		message: NO_MODEL_SLOTS_MESSAGE,
	});
});

test("reportWakeStatus sends the pack mac header", async () => {
	const id = must(dispatchId("abc123def4567890"));
	const expected = packMacHeader(
		await packMac({ dispatchId: id, pem: TEST_APP_PRIVATE_KEY }),
	);
	let authorization: string | undefined;
	await reportWakeStatus({
		dispatchId: id,
		env: {
			INPUT_GITHUB_APP_PRIVATE_KEY: TEST_APP_PRIVATE_KEY,
			VITE_LAB_URL: "https://lab.example",
		},
		fetchImpl: asFetch(async (input, init) => {
			authorization =
				new Request(input, init).headers.get("authorization") ?? undefined;
			await Promise.resolve();
			return Response.json({ status: "failed" });
		}),
		status: "failed",
	});
	expect(authorization).toBe(expected);
});
