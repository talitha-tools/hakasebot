import {
	authJsonBlob,
	commentId,
	commentMarkdown,
	commitSha,
	DEFAULT_FIX_PHRASE,
	ENGINE_KINDS,
	engineKind,
	fixPhrase,
	githubAppSlug,
	lineCount,
	lineNumber,
	lineRange,
	pullNumber,
	replacementText,
	repoPath,
	triggerPhrase,
} from "@hakasebot/core/domain.ts";
import {
	decideReviewEvent,
	defaultReviewPhrases,
	findingToReviewComment,
	mergeAxisReports,
	parseCliReport,
	parseMarker,
	planFromTrigger,
	renderReviewBody,
	renderSuggestionFence,
} from "@hakasebot/core/review.server.ts";
import { runUrl } from "@hakasebot/core/wake/domain.ts";
import { expect, test } from "vitest";

import { phrasesFromEnv } from "#/home/run-config.ts";
import { hashReport, hashReviewBody } from "#/review-hash.ts";

const SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function must<T>(
	result: { kind: "ok"; value: T } | { kind: "invalid"; message: string },
): T {
	if (result.kind === "invalid") {
		throw new Error(result.message);
	}
	return result.value;
}

test("a replacement that contains triple backticks uses a four-backtick fence", () => {
	const fence = renderSuggestionFence(
		replacementText("const fence = ```\ninner\n```\n"),
	);
	expect(fence).toMatch(/^````suggestion\n/u);
});

test("a patch finding carries replacement for its range and no other range", () => {
	const finding = {
		kind: "patch" as const,
		path: must(repoPath("src/main.ts")),
		range: lineRange({
			start: must(lineNumber(4)),
			lineCount: must(lineCount(2)),
		}),
		body: commentMarkdown("drop the extra newline"),
		suggestion: { replacement: replacementText("return n;\n") },
	};
	const comment = findingToReviewComment(
		finding,
		must(runUrl("https://github.com/x/y/actions/runs/9")),
	);
	expect(comment.body).toContain("hehe a little fix!! try this!!");
	expect(comment.body).toContain("---");
	expect(comment.body).toContain("drop the extra newline");
	expect(comment.body).toContain("```suggestion");
	expect(comment.body).toContain(
		"[view the run](<https://github.com/x/y/actions/runs/9>)",
	);
	expect(comment.range.start).toBe(4);
	expect(comment.range.lineCount).toBe(2);
});

test("auto with an empty report comments and never approves", () => {
	const empty = {
		summary: commentMarkdown("clean"),
		findings: [],
	};
	expect(decideReviewEvent({ requested: "auto", report: empty })).toBe(
		"COMMENT",
	);
});

test("mergeAxisReports concatenates without reranking and prefixes axes", () => {
	const standards = must(
		parseCliReport({
			engine: "claude",
			raw: JSON.stringify({
				summary: "standards ok",
				findings: [
					{
						kind: "note",
						path: "a.ts",
						start: 1,
						lineCount: 1,
						body: "mysterious name",
					},
				],
			}),
		}),
	);
	const spec = must(
		parseCliReport({
			engine: "claude",
			raw: JSON.stringify({
				summary: "no spec available",
				findings: [],
			}),
		}),
	);
	const merged = mergeAxisReports({ standards, spec });
	expect(merged.summary).toContain("## Standards");
	expect(merged.summary).toContain("## Spec");
	expect(merged.summary).toContain("Standards: 1 findings. Spec: 0 findings.");
	expect(merged.findings).toHaveLength(1);
	expect(merged.findings[0]?.body).toMatch(/^Standards:/u);
});

test("auto with findings requests changes", () => {
	const report = {
		summary: commentMarkdown("needs work"),
		findings: [
			{
				kind: "note" as const,
				path: must(repoPath("src/main.ts")),
				range: lineRange({
					start: must(lineNumber(1)),
					lineCount: must(lineCount(1)),
				}),
				body: commentMarkdown("nits"),
			},
		],
	};
	expect(decideReviewEvent({ requested: "auto", report })).toBe(
		"REQUEST_CHANGES",
	);
});

test("explicit APPROVE stays APPROVE", () => {
	const empty = {
		summary: commentMarkdown("clean"),
		findings: [],
	};
	expect(decideReviewEvent({ requested: "APPROVE", report: empty })).toBe(
		"APPROVE",
	);
});

test("planFromTrigger maps a review comment with both phrases to fix", () => {
	const planned = planFromTrigger({
		event: {
			kind: "review_comment",
			pullNumber: must(pullNumber(12)),
			commentId: must(commentId(9)),
			body: "@hakasebot please fix this line",
		},
		phrases: {
			trigger: must(triggerPhrase("@hakasebot")),
			fix: must(fixPhrase(DEFAULT_FIX_PHRASE)),
		},
	});
	expect(planned).toEqual({
		kind: "plan",
		plan: {
			kind: "fix",
			pullNumber: 12,
			commentId: 9,
		},
	});
});

test("planFromTrigger maps an issue comment with only the trigger to mention", () => {
	const planned = planFromTrigger({
		event: {
			kind: "issue_comment",
			pullNumber: must(pullNumber(12)),
			commentId: must(commentId(9)),
			body: "@hakasebot look here",
		},
		phrases: {
			trigger: must(triggerPhrase("@hakasebot")),
			fix: must(fixPhrase(DEFAULT_FIX_PHRASE)),
		},
	});
	expect(planned.kind).toBe("plan");
	if (planned.kind !== "plan") {
		return;
	}
	expect(planned.plan.kind).toBe("mention");
});

test("planFromTrigger maps an issue comment with only the fix phrase to mention", () => {
	const planned = planFromTrigger({
		event: {
			kind: "issue_comment",
			pullNumber: must(pullNumber(12)),
			commentId: must(commentId(9)),
			body: "please fix this",
		},
		phrases: {
			trigger: must(triggerPhrase("@hakasebot")),
			fix: must(fixPhrase(DEFAULT_FIX_PHRASE)),
		},
	});
	expect(planned.kind).toBe("plan");
	if (planned.kind !== "plan") {
		return;
	}
	expect(planned.plan.kind).toBe("mention");
});

test("planFromTrigger maps a pull_request event to review", () => {
	const planned = planFromTrigger({
		event: {
			draft: false,
			kind: "pull_request",
			pullNumber: must(pullNumber(3)),
		},
	});
	expect(planned).toEqual({
		kind: "plan",
		plan: { kind: "review", pullNumber: 3 },
	});
});

test("defaultReviewPhrases mentions the hosted app slug", () => {
	const slug = must(githubAppSlug("fork-bot"));
	expect(defaultReviewPhrases(slug).trigger).toBe("@fork-bot");
});

test("phrasesFromEnv omits phrases when trigger_phrase is unset", () => {
	expect(phrasesFromEnv({})).toEqual({ kind: "ok", value: undefined });
});

test("phrasesFromEnv reads trigger_phrase when set", () => {
	const parsed = phrasesFromEnv({ INPUT_TRIGGER_PHRASE: "@fork-bot" });
	expect(parsed).toEqual({
		kind: "ok",
		value: {
			fix: must(fixPhrase(DEFAULT_FIX_PHRASE)),
			trigger: must(triggerPhrase("@fork-bot")),
		},
	});
});

test("parseMarker round-trips the hash from renderReviewBody", () => {
	const report = {
		summary: commentMarkdown("looks fine"),
		findings: [],
	};
	const sha = must(commitSha(SHA));
	const marker = {
		sha,
		engine: "claude" as const,
		contentHash: hashReport(report),
	};
	const body = renderReviewBody({ report, marker });
	expect(parseMarker(body)).toEqual(marker);
});

test("renderReviewBody puts a substitution note after the voice header", () => {
	const report = {
		summary: commentMarkdown("looks fine"),
		findings: [],
	};
	const notice = commentMarkdown(
		"this review used claude-opus-5 because claude-opus-4-8 went away.",
	);
	const sha = must(commitSha(SHA));
	const marker = {
		sha,
		engine: "claude" as const,
		contentHash: hashReviewBody({ notice, report }),
	};
	const body = renderReviewBody({
		marker,
		notice,
		report,
		runLink: must(runUrl("https://github.com/x/y/actions/runs/3")),
	});
	expect(body.startsWith("hehe all clear!! nothing to poke!!")).toBe(true);
	expect(body).toContain("---");
	expect(body).toContain(`${notice}\n\n${report.summary}`);
	expect(body).toContain(
		"[view the run](<https://github.com/x/y/actions/runs/3>)",
	);
	expect(parseMarker(body)).toEqual(marker);
	expect(hashReviewBody({ notice, report })).not.toEqual(hashReport(report));
	expect(hashReviewBody({ report })).toEqual(hashReport(report));
});

test("authJsonBlob keeps the original bytes of an object", () => {
	const raw = '{"token":"abc"}\n';
	const parsed = authJsonBlob(raw);
	expect(parsed).toEqual({ kind: "ok", value: raw });
});

test("authJsonBlob rejects arrays", () => {
	expect(authJsonBlob("[1]").kind).toBe("invalid");
});

test("engineKind accepts every ENGINE_KINDS key", () => {
	for (const key of ENGINE_KINDS) {
		expect(engineKind(key)).toEqual({ kind: "ok", value: key });
	}
	expect(engineKind("copilot").kind).toBe("invalid");
});

test("parseCliReport accepts a valid claude report", () => {
	const parsed = parseCliReport({
		engine: "claude",
		raw: JSON.stringify({
			summary: "looks good",
			findings: [
				{
					kind: "note",
					path: "src/a.ts",
					start: 1,
					lineCount: 1,
					body: "nit",
				},
			],
		}),
	});
	expect(parsed.kind).toBe("ok");
	if (parsed.kind !== "ok") {
		return;
	}
	expect(parsed.value.summary).toBe("looks good");
	expect(parsed.value.findings).toHaveLength(1);
});

test("parseCliReport rejects empty summary with engine in the message", () => {
	const parsed = parseCliReport({
		engine: "grok",
		raw: JSON.stringify({ summary: "", findings: [] }),
	});
	expect(parsed.kind).toBe("invalid");
	if (parsed.kind !== "invalid") {
		return;
	}
	expect(parsed.message).toContain("failed schema");
	expect(parsed.message).toContain("summary");
});

test("parseCliReport rejects extra keys via strict schema", () => {
	const parsed = parseCliReport({
		engine: "claude",
		raw: JSON.stringify({
			summary: "ok",
			findings: [],
			extra: true,
		}),
	});
	expect(parsed.kind).toBe("invalid");
	if (parsed.kind !== "invalid") {
		return;
	}
	expect(parsed.message).toContain("failed schema");
});

test("parseCliReport rejects patch findings without replacement", () => {
	const parsed = parseCliReport({
		engine: "claude",
		raw: JSON.stringify({
			summary: "ok",
			findings: [
				{
					kind: "patch",
					path: "a.ts",
					start: 1,
					lineCount: 1,
					body: "fix",
				},
			],
		}),
	});
	expect(parsed.kind).toBe("invalid");
	if (parsed.kind !== "invalid") {
		return;
	}
	expect(parsed.message).toContain("failed schema");
});

test("parseCliReport rejects invalid JSON with engine in the message", () => {
	const parsed = parseCliReport({
		engine: "cursor",
		raw: "not-json",
	});
	expect(parsed).toEqual({
		kind: "invalid",
		message: "cursor report is not valid JSON",
	});
});
