import { packMac, packMacHeader } from "@hakasebot/core/home/pack-mac.ts";
import {
	handleWakeStatusGet,
	handleWakeStatusPatch,
	parseWakeStatusDispatchId,
} from "@hakasebot/core/wake-status.ts";
import { dispatchId } from "@hakasebot/core/wake/domain.ts";
import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { asFetch } from "@hakasebot/test-kit/helpers/as-fetch.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import { dispatchStillActive } from "#/wake-hold.ts";

const labUrl = "https://lab.example";

function jsonFetch(body: unknown, status = 200): typeof fetch {
	return asFetch(async () => {
		await Promise.resolve();
		return Response.json(body, { status });
	});
}

test("parseWakeStatusDispatchId requires dispatch_id", () => {
	expect(
		parseWakeStatusDispatchId(new URL("https://lab.example/api/wake-status")),
	).toEqual({
		kind: "invalid",
		message: "dispatch_id query is required",
	});
});

test("dispatchStillActive treats superseded status as inactive", async () => {
	const hold = await dispatchStillActive({
		dispatchId: must(dispatchId("abc123")),
		fetchImpl: jsonFetch({ status: "superseded" }),
		labUrl,
	});
	expect(hold).toEqual({ kind: "superseded" });
});

test("dispatchStillActive treats queued status as active", async () => {
	const hold = await dispatchStillActive({
		dispatchId: must(dispatchId("abc123")),
		fetchImpl: jsonFetch({ status: "queued" }),
		labUrl,
	});
	expect(hold).toEqual({ kind: "active" });
});

test("dispatchStillActive treats dispatched status as active", async () => {
	const hold = await dispatchStillActive({
		dispatchId: must(dispatchId("abc123")),
		fetchImpl: jsonFetch({ status: "dispatched" }),
		labUrl,
	});
	expect(hold).toEqual({ kind: "active" });
});

test("dispatchStillActive treats cancelled and failed as inactive", async () => {
	const cancelled = await dispatchStillActive({
		dispatchId: must(dispatchId("abc123")),
		fetchImpl: jsonFetch({ status: "cancelled" }),
		labUrl,
	});
	expect(cancelled).toEqual({ kind: "inactive" });
	const failed = await dispatchStillActive({
		dispatchId: must(dispatchId("abc123")),
		fetchImpl: jsonFetch({ status: "failed" }),
		labUrl,
	});
	expect(failed).toEqual({ kind: "inactive" });
});

test("dispatchStillActive is unknown when Lab is missing or unreachable", async () => {
	const missingLab = await dispatchStillActive({
		dispatchId: must(dispatchId("abc123")),
		env: {},
		fetchImpl: jsonFetch({ status: "queued" }),
	});
	expect(missingLab).toEqual({ kind: "unknown" });
	const unreachable = await dispatchStillActive({
		dispatchId: must(dispatchId("abc123")),
		fetchImpl: asFetch(() => {
			throw new Error("offline");
		}),
		labUrl,
	});
	expect(unreachable).toEqual({ kind: "unknown" });
});

test("handleWakeStatusPatch marks a dispatched wake failed", async () => {
	const mac = await packMac({
		dispatchId: "abc123",
		pem: TEST_APP_PRIVATE_KEY,
	});
	const response = await handleWakeStatusPatch({
		appPrivateKey: TEST_APP_PRIVATE_KEY,
		finishWakeRun: async () => {
			await Promise.resolve();
			return true;
		},
		request: new Request(
			"https://lab.example/api/wake-status?dispatch_id=abc123",
			{
				body: JSON.stringify({ status: "failed" }),
				headers: {
					Authorization: packMacHeader(mac),
					"content-type": "application/json",
				},
				method: "PATCH",
			},
		),
		url: new URL("https://lab.example/api/wake-status?dispatch_id=abc123"),
	});
	expect(response.status).toBe(200);
	await expect(response.json()).resolves.toEqual({ status: "failed" });
});

test("handleWakeStatusGet returns wake status from the store", async () => {
	const response = await handleWakeStatusGet({
		findWakeStatus: async () => {
			await Promise.resolve();
			return "dispatched";
		},
		url: new URL("https://lab.example/api/wake-status?dispatch_id=abc123"),
	});
	expect(response.status).toBe(200);
	await expect(response.json()).resolves.toEqual({ status: "dispatched" });
});
