import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { expect, test } from "vitest";

import { packMac, packMacHeader } from "#/home/pack-mac.ts";
import { handleWakeStatusGet, handleWakeStatusPatch } from "#/wake-status.ts";

const dispatch = "abc123";
const pem = TEST_APP_PRIVATE_KEY;
const patchUrl = new URL(
	`https://lab.example/api/wake-status?dispatch_id=${dispatch}`,
);

async function authorizedPatch(args?: {
	mac?: string;
	status?: string;
}): Promise<Request> {
	const hex = args?.mac ?? (await packMac({ dispatchId: dispatch, pem }));
	return new Request(patchUrl, {
		body: JSON.stringify({ status: args?.status ?? "failed" }),
		headers: {
			Authorization: packMacHeader(hex),
			"content-type": "application/json",
		},
		method: "PATCH",
	});
}

test("handleWakeStatusGet returns wake status without a pack mac", async () => {
	const response = await handleWakeStatusGet({
		findWakeStatus: async () => {
			await Promise.resolve();
			return "dispatched";
		},
		url: patchUrl,
	});
	expect(response.status).toBe(200);
	await expect(response.json()).resolves.toEqual({ status: "dispatched" });
});

test("handleWakeStatusPatch is 401 without a pack mac", async () => {
	let finished = false;
	const response = await handleWakeStatusPatch({
		appPrivateKey: pem,
		finishWakeRun: async () => {
			finished = true;
			await Promise.resolve();
			return true;
		},
		request: new Request(patchUrl, {
			body: JSON.stringify({ status: "failed" }),
			headers: { "content-type": "application/json" },
			method: "PATCH",
		}),
		url: patchUrl,
	});
	expect(response.status).toBe(401);
	expect(finished).toBe(false);
	await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
});

test("handleWakeStatusPatch is 401 with a wrong pack mac before updating", async () => {
	let finished = false;
	const response = await handleWakeStatusPatch({
		appPrivateKey: pem,
		finishWakeRun: async () => {
			finished = true;
			await Promise.resolve();
			return true;
		},
		request: await authorizedPatch({ mac: "00".repeat(32) }),
		url: patchUrl,
	});
	expect(response.status).toBe(401);
	expect(finished).toBe(false);
	await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
});

test("handleWakeStatusPatch is 503 when the hosted app is unset", async () => {
	const response = await handleWakeStatusPatch({
		request: await authorizedPatch(),
		url: patchUrl,
	});
	expect(response.status).toBe(503);
	await expect(response.json()).resolves.toEqual({
		error: "hosted app unset",
	});
});

test("handleWakeStatusPatch marks a dispatched wake failed with a valid mac", async () => {
	const response = await handleWakeStatusPatch({
		appPrivateKey: pem,
		finishWakeRun: async () => {
			await Promise.resolve();
			return true;
		},
		request: await authorizedPatch(),
		url: patchUrl,
	});
	expect(response.status).toBe(200);
	await expect(response.json()).resolves.toEqual({ status: "failed" });
});
