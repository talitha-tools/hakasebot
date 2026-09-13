import {
	commitSha,
	githubAppInstallationId,
	pullNumber,
} from "@hakasebot/core/domain.ts";
import { isRecord } from "@hakasebot/core/is-record.ts";
import { dispatchId } from "@hakasebot/core/wake/domain.ts";
import { TEST_APP_PRIVATE_KEY } from "@hakasebot/test-kit/helpers/app-key.ts";
import { asFetch } from "@hakasebot/test-kit/helpers/as-fetch.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { expect, test } from "vitest";

import { runHomeReview } from "#/home/run-review.ts";

const consumer = testRepoRef("talitha-tools/demo", "900001");

function requestUrl(input: RequestInfo | URL): string {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof URL) {
		return input.href;
	}
	const { url } = input;
	return url;
}

test("runHomeReview reports wake failed when bot credentials are missing", async () => {
	const patched: { status: string; url: string }[] = [];
	const result = await runHomeReview({
		clone: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
		consumerDir: "/tmp/consumer",
		env: {
			INPUT_GITHUB_APP_PRIVATE_KEY: TEST_APP_PRIVATE_KEY,
			VITE_LAB_URL: "https://lab.example",
		},
		fetchImpl: asFetch(async (input, init) => {
			await Promise.resolve();
			const { body: rawBody } = init ?? {};
			let body = "{}";
			if (typeof rawBody === "string") {
				body = rawBody;
			} else if (rawBody !== undefined) {
				body = JSON.stringify(rawBody);
			}
			const parsed: unknown = JSON.parse(body);
			patched.push({
				status:
					isRecord(parsed) && typeof parsed["status"] === "string"
						? parsed["status"]
						: "",
				url: requestUrl(input),
			});
			return Response.json({ status: "failed" });
		}),
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
	});
	expect(result).toEqual({
		kind: "failed",
		message: "github app credentials or github_token required",
	});
	expect(patched).toEqual([
		{
			status: "failed",
			url: "https://lab.example/api/wake-status?dispatch_id=abc123def4567890",
		},
	]);
});

test("runHomeReview skips posting when the dispatch was superseded", async () => {
	let ran = false;
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
			return { kind: "superseded" };
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
			routeGeneration: undefined,
		},
		runReview: async () => {
			ran = true;
			await Promise.resolve();
			return { kind: "failed", message: "should not run" };
		},
	});
	expect(result).toEqual({
		kind: "failed",
		message: "dispatch superseded. this run will not post",
	});
	expect(ran).toBe(false);
});

test("runHomeReview skips posting when the dispatch hold is unknown", async () => {
	let ran = false;
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
			return { kind: "unknown" };
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
			routeGeneration: undefined,
		},
		runReview: async () => {
			ran = true;
			await Promise.resolve();
			return { kind: "failed", message: "should not run" };
		},
	});
	expect(result).toEqual({
		kind: "failed",
		message: "dispatch hold unknown. this run will not post",
	});
	expect(ran).toBe(false);
});

test("runHomeReview skips posting when the dispatch is inactive", async () => {
	let ran = false;
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
			return { kind: "inactive" };
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
			routeGeneration: undefined,
		},
		runReview: async () => {
			ran = true;
			await Promise.resolve();
			return { kind: "failed", message: "should not run" };
		},
	});
	expect(result).toEqual({
		kind: "failed",
		message: "dispatch inactive. this run will not post",
	});
	expect(ran).toBe(false);
});
