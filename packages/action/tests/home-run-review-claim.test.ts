import {
	commitSha,
	githubAppInstallationId,
	pullNumber,
} from "@hakasebot/core/domain.ts";
import { dispatchId } from "@hakasebot/core/wake/domain.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { expect, test } from "vitest";

import { runHomeReview } from "#/home/run-review.ts";

const consumer = testRepoRef("talitha-tools/demo", "900001");

test("runHomeReview skips posting when the claim moved", async () => {
	let ran = false;
	const result = await runHomeReview({
		claimHold: async () => {
			await Promise.resolve();
			return { kind: "moved" };
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
			routeGeneration: 11,
		},
		runReview: async () => {
			ran = true;
			await Promise.resolve();
			return { kind: "failed", message: "should not run" };
		},
	});
	expect(result).toEqual({
		kind: "failed",
		message: "claim moved. this run will not post",
	});
	expect(ran).toBe(false);
});

test("runHomeReview skips posting when the claim hold is unknown", async () => {
	let ran = false;
	const result = await runHomeReview({
		claimHold: async () => {
			await Promise.resolve();
			return { kind: "unknown" };
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
			routeGeneration: 11,
		},
		runReview: async () => {
			ran = true;
			await Promise.resolve();
			return { kind: "failed", message: "should not run" };
		},
	});
	expect(result).toEqual({
		kind: "failed",
		message: "claim hold unknown. this run will not post",
	});
	expect(ran).toBe(false);
});
