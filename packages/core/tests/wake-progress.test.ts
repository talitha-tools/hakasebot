import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { expect, test } from "vitest";

import { pullNumber } from "#/domain.ts";
import { runUrl } from "#/wake/domain.ts";
import {
	commentContainsWakeMarker,
	progressCommentMarker,
	progressCommentPrKey,
	renderFailureComment,
	renderProgressComment,
} from "#/wake/progress-comment.ts";

const consumer = testRepoRef("talitha-tools/demo", "900001");
const prKey = progressCommentPrKey({
	consumer,
	pullNumber: must(pullNumber(1)),
});
const sampleRun = must(runUrl("https://github.com/x/y/actions/runs/1"));

test("progress comment is one marker per pull request", () => {
	const body = renderProgressComment({
		prKey,
		runUrl: sampleRun,
		status: "queued",
	});
	expect(body).toContain(progressCommentMarker(prKey));
	expect(body).toContain("waking up!!");
	expect(body).toContain("---");
	expect(body).toContain(
		"[view the run](<https://github.com/x/y/actions/runs/1>)",
	);
	expect(commentContainsWakeMarker({ body, prKey })).toBe(true);
	expect(prKey).toBe("900001#1");
});

test("started progress comment uses looking copy", () => {
	const body = renderProgressComment({
		prKey,
		runUrl: sampleRun,
		status: "started",
	});
	expect(body).toContain("looking!!");
	expect(body).not.toContain("i'm looking");
});

test("failure comment carries details and run url", () => {
	const body = renderFailureComment({
		kind: "failed",
		runUrl: sampleRun,
		details: "engine timed out",
	});
	expect(body).toContain("aw!! the review flopped");
	expect(body).toContain("---");
	expect(body).toContain("engine timed out");
	expect(body).toContain(
		"[view the run](<https://github.com/x/y/actions/runs/1>)",
	);
	expect(body).not.toContain(progressCommentMarker(prKey));
});

test("broken comment has broken copy", () => {
	const body = renderFailureComment({
		kind: "broken",
		runUrl: undefined,
		details: "couldn't get a github app token for the home repo",
	});
	expect(body).toContain("aw!! it's broken!!");
	expect(body).toContain("---");
	expect(body).toContain("couldn't get a github app token for the home repo");
	expect(body).toContain("run not listed yet");
});

test("no-model-slots comment keeps Lab brains copy", () => {
	const body = renderFailureComment({
		kind: "no-model-slots",
		runUrl: undefined,
	});
	expect(body).toContain("aw!! no brains configured!!");
	expect(body).toContain("---");
	expect(body).toContain("run not listed yet");
	expect(body).not.toContain("looking!!");
	expect(body).not.toContain(progressCommentMarker(prKey));
});

test("no-run comment has never-appeared copy", () => {
	const body = renderFailureComment({
		kind: "no-run",
		runUrl: undefined,
		details: "asked github to start the home run, but it never showed up",
	});
	expect(body).toContain("aw!! the it ignored me!!");
	expect(body).toContain("---");
	expect(body).toContain(
		"asked github to start the home run, but it never showed up",
	);
	expect(body).toContain("run not listed yet");
});
