import {
	CLAIM_NOT_HELD_ERROR,
	generationIfClaimed,
	handleClaimStatusGet,
	parseClaimStatusRepo,
} from "@hakasebot/core/claim-status.ts";
import { githubAppInstallationId } from "@hakasebot/core/domain.ts";
import { asFetch } from "@hakasebot/test-kit/helpers/as-fetch.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { expect, test } from "vitest";

import { claimStillHolds } from "#/claim-hold.ts";

const consumer = testRepoRef("talitha-tools/demo", "900001");
const labUrl = "https://lab.example";
const parsedInstallationId = githubAppInstallationId("9");
if (parsedInstallationId.kind === "invalid") {
	throw new Error(parsedInstallationId.message);
}
const installationId = parsedInstallationId.value;

function jsonFetch(body: unknown, status = 200): typeof fetch {
	return asFetch(async () => {
		await Promise.resolve();
		return Response.json(body, { status });
	});
}

function claimedRoute(generation: number) {
	return {
		enabled: true,
		generation,
		home: { installationId, repo: consumer },
	};
}

test("parseClaimStatusRepo requires a repo id", () => {
	expect(
		parseClaimStatusRepo(new URL("https://lab.example/api/claim-status")),
	).toEqual({ kind: "invalid", message: "repo query is required" });
	expect(
		parseClaimStatusRepo(
			new URL("https://lab.example/api/claim-status?repo=not-a-repo"),
		),
	).toEqual({
		kind: "invalid",
		message: "repository id must be a positive integer",
	});
	expect(
		parseClaimStatusRepo(
			new URL("https://lab.example/api/claim-status?repo=900001"),
		),
	).toEqual({ kind: "ok", value: consumer.id });
});

test("generationIfClaimed is set only when Wake would dispatch", () => {
	expect(generationIfClaimed(claimedRoute(11))).toBe(11);
	expect(
		generationIfClaimed({
			enabled: false,
			generation: 11,
			home: claimedRoute(11).home,
		}),
	).toBeUndefined();
	expect(
		generationIfClaimed({
			enabled: true,
			generation: 11,
			home: undefined,
		}),
	).toBeUndefined();
	expect(
		generationIfClaimed({
			enabled: true,
			generation: undefined,
			home: claimedRoute(11).home,
		}),
	).toBeUndefined();
});

test("claimStillHolds requests claim-status with the consumer repo id", async () => {
	let requestedUrl = "";
	await claimStillHolds({
		consumer,
		expectedGeneration: 4,
		fetchImpl: asFetch(async (input) => {
			await Promise.resolve();
			requestedUrl = input instanceof Request ? input.url : String(input);
			return Response.json({ generation: 4 });
		}),
		labUrl,
	});
	expect(requestedUrl).toBe("https://lab.example/api/claim-status?repo=900001");
});

test("claimStillHolds is unknown when lab URL is missing", async () => {
	const hold = await claimStillHolds({
		consumer,
		env: {},
		expectedGeneration: 4,
		fetchImpl: jsonFetch({ generation: 4 }),
	});
	expect(hold).toEqual({ kind: "unknown" });
});

test("claimStillHolds reads lab URL from Action env", async () => {
	const hold = await claimStillHolds({
		consumer,
		env: { VITE_LAB_URL: labUrl },
		expectedGeneration: 4,
		fetchImpl: jsonFetch({ generation: 4 }),
	});
	expect(hold).toEqual({ kind: "holds" });
});

test("claimStillHolds is unknown when Lab does not answer", async () => {
	const hold = await claimStillHolds({
		consumer,
		expectedGeneration: 4,
		fetchImpl: asFetch(() => {
			throw new Error("offline");
		}),
		labUrl,
	});
	expect(hold).toEqual({ kind: "unknown" });
});

test("claimStillHolds treats a claim-not-held 404 as moved", async () => {
	const hold = await claimStillHolds({
		consumer,
		expectedGeneration: 4,
		fetchImpl: jsonFetch({ error: CLAIM_NOT_HELD_ERROR }, 404),
		labUrl,
	});
	expect(hold).toEqual({ kind: "moved" });
});

test("claimStillHolds is unknown on a generic 404", async () => {
	const hold = await claimStillHolds({
		consumer,
		expectedGeneration: 4,
		fetchImpl: jsonFetch({ error: "nope" }, 404),
		labUrl,
	});
	expect(hold).toEqual({ kind: "unknown" });
});

test("claimStillHolds is unknown when Lab returns 503", async () => {
	const hold = await claimStillHolds({
		consumer,
		expectedGeneration: 4,
		fetchImpl: jsonFetch({ error: "d1 unavailable" }, 503),
		labUrl,
	});
	expect(hold).toEqual({ kind: "unknown" });
});

test("claimStillHolds treats a generation mismatch as moved", async () => {
	const hold = await claimStillHolds({
		consumer,
		expectedGeneration: 4,
		fetchImpl: jsonFetch({ generation: 5 }),
		labUrl,
	});
	expect(hold).toEqual({ kind: "moved" });
});

test("claimStillHolds holds when generation matches", async () => {
	const hold = await claimStillHolds({
		consumer,
		expectedGeneration: 4,
		fetchImpl: jsonFetch({ generation: 4 }),
		labUrl,
	});
	expect(hold).toEqual({ kind: "holds" });
});

test("handleClaimStatusGet is 400 without a repo query", async () => {
	const response = await handleClaimStatusGet({
		url: new URL("https://lab.example/api/claim-status"),
	});
	expect(response.status).toBe(400);
	await expect(response.json()).resolves.toEqual({
		error: "repo query is required",
	});
});

test("handleClaimStatusGet is 400 for a malformed repo query", async () => {
	const response = await handleClaimStatusGet({
		url: new URL("https://lab.example/api/claim-status?repo=not-a-repo"),
	});
	expect(response.status).toBe(400);
	await expect(response.json()).resolves.toEqual({
		error: "repository id must be a positive integer",
	});
});

test("handleClaimStatusGet is 500 when the store cannot load the route", async () => {
	const response = await handleClaimStatusGet({
		findRoute: async () => {
			await Promise.resolve();
			return { kind: "invalid", message: "store exploded" };
		},
		url: new URL("https://lab.example/api/claim-status?repo=900001"),
	});
	expect(response.status).toBe(500);
	await expect(response.json()).resolves.toEqual({
		error: "store exploded",
	});
});

test("handleClaimStatusGet is 503 when D1 is missing", async () => {
	const response = await handleClaimStatusGet({
		url: new URL("https://lab.example/api/claim-status?repo=900001"),
	});
	expect(response.status).toBe(503);
	await expect(response.json()).resolves.toEqual({
		error: "d1 unavailable",
	});
});

test("handleClaimStatusGet is 404 when the claim is not dispatchable", async () => {
	const response = await handleClaimStatusGet({
		findRoute: async () => {
			await Promise.resolve();
			return {
				kind: "ok",
				value: {
					enabled: false,
					generation: 4,
					home: undefined,
				},
			};
		},
		url: new URL("https://lab.example/api/claim-status?repo=900001"),
	});
	expect(response.status).toBe(404);
	await expect(response.json()).resolves.toEqual({
		error: CLAIM_NOT_HELD_ERROR,
	});
});

test("handleClaimStatusGet returns generation when the claim is held", async () => {
	const response = await handleClaimStatusGet({
		findRoute: async () => {
			await Promise.resolve();
			return { kind: "ok", value: claimedRoute(11) };
		},
		url: new URL("https://lab.example/api/claim-status?repo=900001"),
	});
	expect(response.status).toBe(200);
	await expect(response.json()).resolves.toEqual({ generation: 11 });
});
