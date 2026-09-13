import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { commitSha, githubToken, pullNumber } from "@hakasebot/core/domain.ts";
import { listPullFiles } from "@hakasebot/core/github-api.server.ts";
import { renderReviewBody } from "@hakasebot/core/review.server.ts";
import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import {
	FAKE_ENGINE_BIN,
	FAKE_SKILLS_BIN,
	HEAD_SHA,
	claudeJob,
	codexJob,
	grokJob,
	must,
	reviewTrigger,
	sampleMergedReviewReport,
} from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { afterEach, expect, test } from "vitest";

import { SKILLS_BIN_ENV } from "#/engines.ts";
import { hashReport } from "#/review-hash.ts";
import { ReviewRuntime } from "#/review-runtime.ts";

const HEAD = must(commitSha(HEAD_SHA));

const X_TS_HEAD_PATCH = [
	"@@ -1,2 +1,2 @@",
	" looks",
	"-old",
	"+original;",
].join("\n");

function pullFilesForSrcXTs() {
	return {
		json: [
			{
				filename: "src/x.ts",
				status: "modified",
				patch: X_TS_HEAD_PATCH,
			},
		],
	};
}

const previousBin = process.env["HAKASEBOT_ENGINE_BIN"];
const previousSkillsBin = process.env[SKILLS_BIN_ENV];
const previousMode = process.env["HAKASEBOT_FAKE_ENGINE_MODE"];
const previousWorkspace = process.env["GITHUB_WORKSPACE"];

let restoreFetch: (() => void) | undefined;
let checkoutDir: string | undefined;

afterEach(async () => {
	restoreFetch?.();
	restoreFetch = undefined;

	if (previousBin === undefined) {
		delete process.env["HAKASEBOT_ENGINE_BIN"];
	} else {
		process.env["HAKASEBOT_ENGINE_BIN"] = previousBin;
	}
	if (previousSkillsBin === undefined) {
		delete process.env["HAKASEBOT_SKILLS_BIN"];
	} else {
		process.env[SKILLS_BIN_ENV] = previousSkillsBin;
	}
	if (previousMode === undefined) {
		delete process.env["HAKASEBOT_FAKE_ENGINE_MODE"];
	} else {
		process.env["HAKASEBOT_FAKE_ENGINE_MODE"] = previousMode;
	}
	if (previousWorkspace === undefined) {
		delete process.env["GITHUB_WORKSPACE"];
	} else {
		process.env["GITHUB_WORKSPACE"] = previousWorkspace;
	}
	if (checkoutDir !== undefined) {
		await rm(checkoutDir, { recursive: true, force: true });
		checkoutDir = undefined;
	}
});

async function useFakeEngine(
	mode?: "ok" | "auth-fail" | "fail",
): Promise<void> {
	checkoutDir = await mkdtemp(path.join(tmpdir(), "hakase-runtime-"));
	await mkdir(path.join(checkoutDir, "src"), { recursive: true });
	await Bun.write(path.join(checkoutDir, "src/x.ts"), "looks\noriginal;\n");
	process.env["HAKASEBOT_ENGINE_BIN"] = FAKE_ENGINE_BIN;
	process.env[SKILLS_BIN_ENV] = FAKE_SKILLS_BIN;
	process.env["GITHUB_WORKSPACE"] = checkoutDir;
	if (mode === undefined || mode === "ok") {
		delete process.env["HAKASEBOT_FAKE_ENGINE_MODE"];
	} else {
		process.env["HAKASEBOT_FAKE_ENGINE_MODE"] = mode;
	}
}

test("ReviewRuntime dry-run spawns the fake engine and skips GitHub POSTs", async () => {
	await useFakeEngine();
	restoreFetch = installGithubFetchMock({
		getPull: () => ({
			json: { head: { sha: HEAD_SHA } },
		}),
		getPullFiles: pullFilesForSrcXTs,
	});

	const result = await ReviewRuntime.run({
		job: claudeJob({ dryRun: true }),
		trigger: reviewTrigger(7),
	});

	expect(result).toEqual({
		kind: "dry-run",
		sha: HEAD_SHA,
		report: sampleMergedReviewReport("claude"),
	});
});

test("ReviewRuntime returns reseed when codex reports unauthorized", async () => {
	await useFakeEngine("auth-fail");
	restoreFetch = installGithubFetchMock({
		getPull: () => ({
			json: { head: { sha: HEAD_SHA } },
		}),
		getPullFiles: pullFilesForSrcXTs,
	});

	const result = await ReviewRuntime.run({
		job: codexJob({ dryRun: true }),
		trigger: reviewTrigger(),
	});

	expect(result.kind).toBe("reseed");
	if (result.kind !== "reseed") {
		return;
	}
	expect(result.engine).toBe("codex");
	expect(result.message).toContain("codex");
});

test("ReviewRuntime returns reseed when grok reports expired login", async () => {
	await useFakeEngine("auth-fail");
	restoreFetch = installGithubFetchMock({
		getPull: () => ({
			json: { head: { sha: HEAD_SHA } },
		}),
		getPullFiles: pullFilesForSrcXTs,
	});

	const result = await ReviewRuntime.run({
		job: grokJob(),
		trigger: reviewTrigger(),
	});

	expect(result.kind).toBe("reseed");
	if (result.kind !== "reseed") {
		return;
	}
	expect(result.engine).toBe("grok");
});

test("ReviewRuntime skips posting when an identical marker already exists", async () => {
	await useFakeEngine();
	const report = sampleMergedReviewReport("claude");
	const contentHash = hashReport(report);
	const body = renderReviewBody({
		report,
		marker: {
			sha: HEAD,
			engine: "claude",
			contentHash,
		},
	});

	let createCalled = false;
	restoreFetch = installGithubFetchMock({
		getPull: () => ({
			json: { head: { sha: HEAD_SHA } },
		}),
		getPullFiles: pullFilesForSrcXTs,
		listReviews: () => ({
			json: [
				{
					id: 42,
					body,
					commit_id: HEAD_SHA,
					state: "COMMENTED",
					submitted_at: "2024-01-01T00:00:00Z",
				},
			],
		}),
		createReview: () => {
			createCalled = true;
			return { json: { id: 99 } };
		},
	});

	const result = await ReviewRuntime.run({
		job: claudeJob({ dryRun: false }),
		trigger: reviewTrigger(),
	});

	expect(createCalled).toBe(false);
	expect(result).toEqual({
		kind: "skipped-unchanged",
		reviewId: 42,
		sha: HEAD_SHA,
	});
});

test("ReviewRuntime dismisses a stale marker and posts a new review", async () => {
	await useFakeEngine();
	const report = sampleMergedReviewReport("claude");
	const staleBody = renderReviewBody({
		report,
		marker: {
			sha: HEAD,
			engine: "claude",
			contentHash: hashReport({
				summary: report.summary,
				findings: [],
			}),
		},
	});

	const dismissed: string[] = [];
	let createdEvent: string | undefined;
	restoreFetch = installGithubFetchMock({
		getPull: () => ({
			json: { head: { sha: HEAD_SHA } },
		}),
		getPullFiles: pullFilesForSrcXTs,
		listReviews: () => ({
			json: [
				{
					id: 11,
					body: staleBody,
					commit_id: HEAD_SHA,
					state: "COMMENTED",
					submitted_at: "2024-01-01T00:00:00Z",
				},
			],
		}),
		dismissReview: (_pull, reviewId) => {
			dismissed.push(reviewId);
			return { json: {} };
		},
		createReview: (_pull, body) => {
			if (
				typeof body === "object" &&
				body !== null &&
				"event" in body &&
				typeof body["event"] === "string"
			) {
				createdEvent = body["event"];
			}
			return { json: { id: 77 } };
		},
	});

	const result = await ReviewRuntime.run({
		job: claudeJob(),
		trigger: reviewTrigger(),
	});

	expect(dismissed).toEqual(["11"]);
	expect(createdEvent).toBe("REQUEST_CHANGES");
	expect(result).toEqual({
		kind: "posted",
		reviewId: 77,
		sha: HEAD_SHA,
		findingCount: 2,
	});
});

test("ReviewRuntime skips when a matching hash exists for the SHA from any engine", async () => {
	await useFakeEngine();
	const report = sampleMergedReviewReport("claude");
	const contentHash = hashReport(report);
	const body = renderReviewBody({
		report,
		marker: {
			sha: HEAD,
			engine: "codex",
			contentHash,
		},
	});

	let createCalled = false;
	restoreFetch = installGithubFetchMock({
		getPull: () => ({
			json: { head: { sha: HEAD_SHA } },
		}),
		getPullFiles: pullFilesForSrcXTs,
		listReviews: () => ({
			json: [
				{
					id: 55,
					body,
					commit_id: HEAD_SHA,
					state: "COMMENTED",
					submitted_at: "2024-01-01T00:00:00Z",
				},
			],
		}),
		createReview: () => {
			createCalled = true;
			return { json: { id: 99 } };
		},
	});

	const result = await ReviewRuntime.run({
		job: claudeJob({ dryRun: false }),
		trigger: reviewTrigger(),
	});

	expect(createCalled).toBe(false);
	expect(result).toEqual({
		kind: "skipped-unchanged",
		reviewId: 55,
		sha: HEAD_SHA,
	});
});

test("ReviewRuntime fails when the fake engine exits without auth language", async () => {
	await useFakeEngine("fail");
	restoreFetch = installGithubFetchMock({
		getPull: () => ({
			json: { head: { sha: HEAD_SHA } },
		}),
		getPullFiles: pullFilesForSrcXTs,
	});

	const result = await ReviewRuntime.run({
		job: claudeJob({ dryRun: true }),
		trigger: reviewTrigger(),
	});

	expect(result.kind).toBe("failed");
	if (result.kind !== "failed") {
		return;
	}
	expect(result.message).toContain("engine exited 2");
});

test("ReviewRuntime drops findings on ignore paths before posting", async () => {
	await useFakeEngine();
	restoreFetch = installGithubFetchMock({
		getPull: () => ({
			json: { head: { sha: HEAD_SHA } },
		}),
		getPullFiles: pullFilesForSrcXTs,
	});

	const result = await ReviewRuntime.run({
		job: claudeJob({ dryRun: true }),
		trigger: reviewTrigger(),
		instructions: { ignorePaths: ["src/x.ts"] },
	});

	expect(result.kind).toBe("dry-run");
	if (result.kind !== "dry-run") {
		return;
	}
	expect(result.report.findings).toEqual([]);
	expect(result.report.summary).toContain("Dropped 2 findings");
});

test("listPullFiles paginates and maps filename plus patch", async () => {
	restoreFetch = installGithubFetchMock({
		getPullFiles: (_pull, page) => {
			if (page === "1") {
				return {
					json: Array.from({ length: 100 }, (_slot, index) => ({
						filename: `f${String(index)}.ts`,
						status: "modified",
						patch: "@@ -1 +1 @@\n+x",
					})),
				};
			}
			return {
				json: [
					{
						filename: "last.ts",
						status: "added",
						patch: "@@ -0,0 +1 @@\n+y",
					},
				],
			};
		},
	});
	const listed = await listPullFiles({
		repo: testRepoRef("acme/lab", "880001"),
		pullNumber: must(pullNumber(7)),
		token: must(githubToken("ghs_test")),
	});
	expect(listed.kind).toBe("ok");
	if (listed.kind !== "ok") {
		return;
	}
	expect(listed.value).toHaveLength(101);
	expect(listed.value[100]?.filename).toBe("last.ts");
});
