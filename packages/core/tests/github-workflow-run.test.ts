import { installGithubFetchMock } from "@hakasebot/test-kit/helpers/github-fetch-mock.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { expect, test } from "vitest";

import { githubToken } from "#/domain.ts";
import {
	cancelWorkflowRun,
	workflowRunIdFromUrl,
} from "#/github-api.server.ts";

test("workflowRunIdFromUrl parses a github actions run url", () => {
	expect(
		workflowRunIdFromUrl(
			"https://github.com/talitha-tools/review-home/actions/runs/99",
		),
	).toEqual({ kind: "ok", value: "99" });
});

test("workflowRunIdFromUrl rejects urls without a run id", () => {
	expect(
		workflowRunIdFromUrl("https://github.com/talitha-tools/review-home"),
	).toEqual({
		kind: "invalid",
		message: "workflow run id missing from url",
	});
});

test("cancelWorkflowRun posts to the github cancel endpoint", async () => {
	const cancelledRunIds: string[] = [];
	const restore = installGithubFetchMock({
		cancelWorkflowRun: (runId) => {
			cancelledRunIds.push(runId);
			return { json: {}, status: 202 };
		},
	});
	try {
		const repo = testRepoRef("talitha-tools/review-home", "900002");
		const result = await cancelWorkflowRun({
			repo,
			runId: "99",
			token: must(githubToken("ghs_test")),
		});
		expect(result).toEqual({ kind: "ok", value: undefined });
		expect(cancelledRunIds).toEqual(["99"]);
	} finally {
		restore();
	}
});
