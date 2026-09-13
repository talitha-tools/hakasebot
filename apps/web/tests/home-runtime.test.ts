import { modelName } from "@hakasebot/core/domain.ts";
import { packMac, packMacHeader } from "@hakasebot/core/home/pack-mac.ts";
import type { HomeRuntimePack } from "@hakasebot/core/home/runtime-pack.ts";
import { parseHomeRuntimePack } from "@hakasebot/core/home/runtime-pack.ts";
import {
	encryptCredential,
	generateEncryptionKey,
} from "@hakasebot/core/vault/crypto.ts";
import { accountId, modelSlotId } from "@hakasebot/core/vault/domain.ts";
import type { SealedCredential } from "@hakasebot/core/vault/domain.ts";
import { dispatchId } from "@hakasebot/core/wake/domain.ts";
import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { expect, test } from "vitest";

import {
	handleHomeRuntimeGet,
	parseHomeRuntimeDispatchId,
} from "#/home-runtime.ts";

const consumer = testRepoRef("talitha-tools/demo", "900001");
const slotId = must(modelSlotId("slot_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
const accId = must(accountId("acc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
const model = must(modelName("claude-opus-4"));
const dispatch = "abc123def4567890";
const pem = TEST_APP_PRIVATE_KEY;
const packUrl = new URL(
	`https://lab.example/api/home-runtime?dispatch_id=${dispatch}`,
);

async function sampleSealed(): Promise<SealedCredential> {
	return encryptCredential({
		accountId: accId,
		plaintext: "sk-ant-test-token",
		encryptionKey: generateEncryptionKey(),
	});
}

async function samplePack(): Promise<HomeRuntimePack> {
	const sealed = await sampleSealed();
	return {
		catalogs: {},
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
					similarModel: true,
				},
			],
			version: 1,
		},
		vault: {
			accounts: [sealed],
			version: 1,
		},
		version: 1,
	};
}

async function authorizedPackRequest(mac?: string): Promise<Request> {
	const hex = mac ?? (await packMac({ dispatchId: dispatch, pem }));
	return new Request(packUrl, {
		headers: { Authorization: packMacHeader(hex) },
	});
}

test("parseHomeRuntimeDispatchId requires dispatch_id", () => {
	expect(
		parseHomeRuntimeDispatchId(new URL("https://lab.example/api/home-runtime")),
	).toEqual({
		kind: "invalid",
		message: "dispatch_id query is required",
	});
});

test("handleHomeRuntimeGet is 400 without dispatch_id", async () => {
	const response = await handleHomeRuntimeGet({
		url: new URL("https://lab.example/api/home-runtime"),
	});
	expect(response.status).toBe(400);
});

test("handleHomeRuntimeGet is 503 when the hosted app is unset", async () => {
	const response = await handleHomeRuntimeGet({
		request: await authorizedPackRequest(),
		url: packUrl,
	});
	expect(response.status).toBe(503);
	await expect(response.json()).resolves.toEqual({
		error: "hosted app unset",
	});
});

test("handleHomeRuntimeGet is 401 without a pack mac", async () => {
	const response = await handleHomeRuntimeGet({
		appPrivateKey: pem,
		findWake: async () => {
			await Promise.resolve();
			return { consumer, githubUserId: "42" };
		},
		request: new Request(packUrl),
		url: packUrl,
	});
	expect(response.status).toBe(401);
	await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
});

test("handleHomeRuntimeGet is 401 with a wrong pack mac before looking up the wake", async () => {
	let lookedUp = false;
	const response = await handleHomeRuntimeGet({
		appPrivateKey: pem,
		buildPack: async () => {
			await Promise.resolve();
			return { kind: "ok", value: await samplePack() };
		},
		findWake: async () => {
			lookedUp = true;
			await Promise.resolve();
			return { consumer, githubUserId: "42" };
		},
		request: await authorizedPackRequest("00".repeat(32)),
		url: packUrl,
	});
	expect(response.status).toBe(401);
	expect(lookedUp).toBe(false);
	await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
});

test("handleHomeRuntimeGet is 503 when D1 is missing", async () => {
	const response = await handleHomeRuntimeGet({
		appPrivateKey: pem,
		request: await authorizedPackRequest(),
		url: packUrl,
	});
	expect(response.status).toBe(503);
	await expect(response.json()).resolves.toEqual({ error: "d1 unavailable" });
});

test("handleHomeRuntimeGet is 404 when the wake is missing", async () => {
	const pack = await samplePack();
	const response = await handleHomeRuntimeGet({
		appPrivateKey: pem,
		buildPack: async () => {
			await Promise.resolve();
			return { kind: "ok", value: pack };
		},
		findWake: async () => {
			await Promise.resolve();
			return;
		},
		request: await authorizedPackRequest(),
		url: packUrl,
	});
	expect(response.status).toBe(404);
	await expect(response.json()).resolves.toEqual({ error: "wake not found" });
});

test("handleHomeRuntimeGet returns the runtime pack", async () => {
	const pack = await samplePack();
	const response = await handleHomeRuntimeGet({
		appPrivateKey: pem,
		buildPack: async (wake) => {
			expect(wake.githubUserId).toBe("42");
			expect(wake.consumer).toEqual(consumer);
			await Promise.resolve();
			return { kind: "ok", value: pack };
		},
		findWake: async (id) => {
			expect(id).toBe(must(dispatchId(dispatch)));
			await Promise.resolve();
			return { consumer, githubUserId: "42" };
		},
		request: await authorizedPackRequest(),
		url: packUrl,
	});
	expect(response.status).toBe(200);
	const body: unknown = await response.json();
	expect(parseHomeRuntimePack(body)).toEqual({ kind: "ok", value: pack });
});

test("parseHomeRuntimePack reads nested prefs objects without a string round-trip", async () => {
	const pack = await samplePack();
	expect(parseHomeRuntimePack(pack)).toEqual({ kind: "ok", value: pack });
});

test("parseHomeRuntimePack treats a missing catalogs field as empty", async () => {
	const pack = await samplePack();
	const { catalogs: _catalogs, ...without } = pack;
	void _catalogs;
	expect(parseHomeRuntimePack(without)).toEqual({
		kind: "ok",
		value: { ...without, catalogs: {} },
	});
});
