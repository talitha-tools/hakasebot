import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import {
	layoutPostedComment,
	runLinkOrFallback,
} from "#/posted-comment-layout.ts";
import { runUrl } from "#/wake/domain.ts";

test("layoutPostedComment puts a rule between prose and content", () => {
	expect(
		layoutPostedComment({
			prose: "look look!!",
			content: "Neutral finding.",
			footer: "[view the run](<https://example/run/1>)",
		}),
	).toBe(
		[
			"look look!!",
			"---",
			"Neutral finding.",
			"---",
			"[view the run](<https://example/run/1>)",
		].join("\n\n"),
	);
});

test("layoutPostedComment still rules when content is absent", () => {
	expect(
		layoutPostedComment({
			prose: "looking!!",
			footer: "run not listed yet",
		}),
	).toBe(["looking!!", "---", "run not listed yet"].join("\n\n"));
});

test("runLinkOrFallback labels the Actions url in angle brackets", () => {
	const link = must(runUrl("https://github.com/x/y/actions/runs/1"));
	expect(runLinkOrFallback(link)).toBe(
		"[view the run](<https://github.com/x/y/actions/runs/1>)",
	);
	expect(runLinkOrFallback(undefined)).toBe("run not listed yet");
});

test("runUrl rejects non-http schemes and newlines", () => {
	expect(runUrl("ftp://files.example/run").kind).toBe("invalid");
	expect(runUrl("https://github.com/x\ny").kind).toBe("invalid");
	expect(runUrl("not a url").kind).toBe("invalid");
	expect(runUrl("https://github.com/x/y/actions/runs/1").kind).toBe("ok");
});
