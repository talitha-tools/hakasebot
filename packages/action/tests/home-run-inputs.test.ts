import { expect, test } from "vitest";

import { parseHomeRunInputs } from "#/home/run-inputs.ts";

test("parseHomeRunInputs rejects a missing target_repo", () => {
	expect(parseHomeRunInputs({ env: {} })).toEqual({
		kind: "invalid",
		message: "target_repo is required",
	});
});

test("parseHomeRunInputs rejects a missing consumer_repo_id", () => {
	expect(
		parseHomeRunInputs({
			env: {
				INPUT_TARGET_REPO: "talitha-tools/demo",
			},
		}),
	).toEqual({
		kind: "invalid",
		message: "consumer_repo_id is required",
	});
});

test("parseHomeRunInputs reads dispatch fields", () => {
	const parsed = parseHomeRunInputs({
		env: {
			INPUT_CONSUMER_REPO_ID: "900001",
			INPUT_DISPATCH_ID: "abc123def4567890",
			INPUT_HEAD_SHA: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
			INPUT_INSTALLATION_ID: "9",
			INPUT_PLAN: "review",
			INPUT_PULL_NUMBER: "4",
			INPUT_TARGET_REPO: "talitha-tools/demo",
		},
	});
	expect(parsed.kind).toBe("ok");
	if (parsed.kind !== "ok") {
		return;
	}
	expect(parsed.value.consumer).toEqual({
		id: "900001",
		name: "demo",
		owner: "talitha-tools",
	});
	expect(parsed.value.plan.kind).toBe("review");
	expect(parsed.value.pullNumber).toBe(4);
	expect(parsed.value.routeGeneration).toBeUndefined();
});

test("parseHomeRunInputs reads route_generation", () => {
	const parsed = parseHomeRunInputs({
		env: {
			INPUT_CONSUMER_REPO_ID: "900001",
			INPUT_DISPATCH_ID: "abc123def4567890",
			INPUT_INSTALLATION_ID: "9",
			INPUT_PLAN: "review",
			INPUT_PULL_NUMBER: "4",
			INPUT_ROUTE_GENERATION: "42",
			INPUT_TARGET_REPO: "talitha-tools/demo",
		},
	});
	expect(parsed.kind).toBe("ok");
	if (parsed.kind !== "ok") {
		return;
	}
	expect(parsed.value.routeGeneration).toBe(42);
});
