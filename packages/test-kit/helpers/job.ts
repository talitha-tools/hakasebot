import path from "node:path";

import {
	authJsonBlob,
	claudeOauthToken,
	effort,
	githubAppSlug,
	githubToken,
	modelName,
	pullNumber,
} from "@hakasebot/core/domain.ts";
import type { Job, ReviewReport, Trigger } from "@hakasebot/core/domain.ts";
import {
	defaultReviewPhrases,
	mergeAxisReports,
	parseCliReport,
} from "@hakasebot/core/review.server.ts";

import { testRepoRef } from "./repo.ts";

const HEAD_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const SAMPLE_REPORT_JSON = JSON.stringify({
	summary: "markdown",
	findings: [
		{
			kind: "note",
			path: "src/x.ts",
			start: 1,
			lineCount: 1,
			body: "looks fine here",
		},
		{
			kind: "patch",
			path: "src/x.ts",
			start: 2,
			lineCount: 1,
			body: "prefer this form",
			replacement: "fixed;\n",
		},
	],
});

function fixture(name: string): string {
	return path.join(import.meta.dirname, "..", "fixtures", name);
}

const FAKE_ENGINE_BIN = fixture("fake-engine.mjs");
const FAKE_SKILLS_BIN = fixture("fake-skills.mjs");
const FAKE_SKILLS_FAIL_BIN = fixture("fake-skills-fail.mjs");

function must<T>(
	result: { kind: "ok"; value: T } | { kind: "invalid"; message: string },
): T {
	if (result.kind === "invalid") {
		throw new Error(result.message);
	}
	return result.value;
}

function sampleReport(engine: "claude" | "codex" | "grok"): ReviewReport {
	return must(
		parseCliReport({
			engine,
			raw: SAMPLE_REPORT_JSON,
		}),
	);
}

function sampleMergedReviewReport(
	engine: "claude" | "codex" | "grok",
): ReviewReport {
	const standards = must(
		parseCliReport({
			engine,
			raw: JSON.stringify({
				summary: "standards summary",
				findings: [
					{
						kind: "note",
						path: "src/x.ts",
						start: 1,
						lineCount: 1,
						body: "Standards: looks fine here",
					},
				],
			}),
		}),
	);
	const spec = must(
		parseCliReport({
			engine,
			raw: JSON.stringify({
				summary: "spec summary",
				findings: [
					{
						kind: "patch",
						path: "src/x.ts",
						start: 2,
						lineCount: 1,
						body: "Spec: prefer this form",
						replacement: "fixed;\n",
					},
				],
			}),
		}),
	);
	return mergeAxisReports({ standards, spec });
}

function baseJob(extra: Partial<Job> = {}): Job {
	return {
		bot: { kind: "actions-bot", token: must(githubToken("ghs_test")) },
		dryRun: false,
		engine: {
			credential: must(claudeOauthToken("oauth-token")),
			effort: must(effort("medium")),
			fast: false,
			kind: "claude",
			model: must(modelName("opus")),
		},
		failOnFindings: false,
		phrases: defaultReviewPhrases(must(githubAppSlug("hakasebot"))),
		repo: testRepoRef("talitha-tools/demo", "900001"),
		reviewEvent: "auto",
		...extra,
	};
}

function claudeJob(extra: Partial<Job> = {}): Job {
	return baseJob(extra);
}

function codexJob(extra: Partial<Job> = {}): Job {
	return baseJob({
		engine: {
			credential: must(authJsonBlob('{"token":"codex-auth"}')),
			effort: must(effort("medium")),
			fast: false,
			kind: "codex",
			model: must(modelName("gpt-5")),
		},
		...extra,
	});
}

function grokJob(extra: Partial<Job> = {}): Job {
	return baseJob({
		engine: {
			credential: must(authJsonBlob('{"token":"grok-auth"}')),
			effort: must(effort("medium")),
			kind: "grok",
			model: must(modelName("grok-4")),
		},
		...extra,
	});
}

function reviewTrigger(number = 1): Trigger {
	return {
		kind: "review",
		pullNumber: must(pullNumber(number)),
	};
}

export {
	FAKE_ENGINE_BIN,
	FAKE_SKILLS_BIN,
	FAKE_SKILLS_FAIL_BIN,
	HEAD_SHA,
	SAMPLE_REPORT_JSON,
	claudeJob,
	codexJob,
	grokJob,
	must,
	reviewTrigger,
	sampleMergedReviewReport,
	sampleReport,
};
