import { expect, test } from "vitest";

import { workflowRunMatchesName } from "#/github-api.server.ts";

test("workflowRunMatchesName uses display_title from run-name", () => {
	expect(
		workflowRunMatchesName({
			displayTitle: "home-abc123",
			name: "home-review",
			runName: "home-abc123",
		}),
	).toBe(true);
});

test("workflowRunMatchesName ignores unrelated runs", () => {
	expect(
		workflowRunMatchesName({
			displayTitle: "home-other",
			name: "home-review",
			runName: "home-abc123",
		}),
	).toBe(false);
});
