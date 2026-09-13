import { exhaustive } from "@hakasebot/core/domain.ts";
import type { Plan } from "@hakasebot/core/domain.ts";

import { engineScriptsPromptLines } from "./engine-scripts.ts";
import type { PriorReviewContext } from "./incremental-review.ts";

const REPORT_SCHEMA = `{
  "summary": "markdown summary of the review",
  "findings": [
    {
      "kind": "note",
      "path": "relative/path.ts",
      "start": 1,
      "lineCount": 1,
      "body": "comment markdown"
    },
    {
      "kind": "patch",
      "path": "relative/path.ts",
      "start": 1,
      "lineCount": 1,
      "body": "comment markdown",
      "replacement": "suggested replacement text"
    }
  ]
}`;

export type ReviewAxis = "standards" | "spec";

function githubFindingsGuidance(axis: ReviewAxis): string {
	const label = axis === "standards" ? "Standards" : "Spec";
	return [
		"## GitHub review output",
		"Respond with findings as native GitHub review comments via the JSON schema below:",
		`- Start each finding body with "${label}:" so the axis stays visible on the comment.`,
		'- Prefer kind "patch" with a concrete "replacement" when a fix is appropriate; GitHub renders that as a suggestion block.',
		'- Use kind "note" for judgement calls, missing requirements, scope creep, or when a replacement is not appropriate.',
		"Write a short summary for this axis only.",
	].join("\n");
}

function axisPassSharedGuidance(incremental: boolean): string[] {
	if (incremental) {
		return [
			"Fixed point: changes since the prior posted review on this pull request (run the review-diff-since Engine script). Do not ask questions.",
			"Do not spawn further sub-agents; this process is already one parallel axis.",
		];
	}
	return [
		"Fixed point: the merge-base of this pull request with the default branch (run the review-merge-base Engine script). Do not ask questions.",
		"Do not spawn further sub-agents; this process is already one parallel axis.",
	];
}

function incrementalReviewContextLines(
	priorReview: PriorReviewContext,
): string[] {
	return [
		"This is a follow-up review. The prior posted review on this pull request is quoted below for context only.",
		"Review only the incremental diff from the review-diff-since script. Do not repeat prior findings unless the incremental diff reintroduces or worsens them.",
		"Prior review:",
		priorReview.priorBody,
	];
}

/** Thin Standards-axis brief; criteria live in the installed code-review skill. */
export function standardsReviewGuidance(incremental = false): string {
	return [
		"Follow the installed code-review skill for the Standards axis only. Do not review Spec in this pass.",
		...axisPassSharedGuidance(incremental),
		"If docs/agents/issue-tracker.md is missing, continue with in-repo standards sources and the skill smell baseline.",
	].join("\n");
}

/** Thin Spec-axis brief; criteria live in the installed code-review skill. */
export function specReviewGuidance(incremental = false): string {
	return [
		"Follow the installed code-review skill for the Spec axis only. Do not review Standards in this pass.",
		...axisPassSharedGuidance(incremental),
		"If docs/agents/issue-tracker.md is missing, discover the spec from commit messages and docs/, specs/, or .scratch/ paths; if none exist, report no spec available.",
	].join("\n");
}

/** JSON Schema for agy --json-schema (structured_output). */
export const REPORT_JSON_SCHEMA = JSON.stringify({
	type: "object",
	additionalProperties: false,
	properties: {
		summary: { type: "string", minLength: 1 },
		findings: {
			type: "array",
			items: {
				oneOf: [
					{
						type: "object",
						additionalProperties: false,
						properties: {
							kind: { const: "note" },
							path: { type: "string", minLength: 1 },
							start: { type: "integer", minimum: 1 },
							lineCount: { type: "integer", minimum: 1 },
							body: { type: "string", minLength: 1 },
						},
						required: ["kind", "path", "start", "lineCount", "body"],
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							kind: { const: "patch" },
							path: { type: "string", minLength: 1 },
							start: { type: "integer", minimum: 1 },
							lineCount: { type: "integer", minimum: 1 },
							body: { type: "string", minLength: 1 },
							replacement: { type: "string" },
						},
						required: [
							"kind",
							"path",
							"start",
							"lineCount",
							"body",
							"replacement",
						],
					},
				],
			},
		},
	},
	required: ["summary", "findings"],
});

export interface ReviewInstructions {
	prompt?: string;
	ignorePaths?: readonly string[];
	consumerNotes?: string;
}

function reviewInstructionLines(
	instructions: ReviewInstructions | undefined,
): string[] {
	if (instructions === undefined) {
		return [];
	}
	const lines: string[] = [];
	const prompt = instructions.prompt?.trim();
	if (prompt !== undefined && prompt.length > 0) {
		lines.push(prompt);
	}
	const ignorePaths =
		instructions.ignorePaths
			?.map((item) => item.trim())
			.filter((item) => item.length > 0) ?? [];
	if (ignorePaths.length > 0) {
		lines.push(
			"Ignore these paths:",
			...ignorePaths.map((item) => `- ${item}`),
		);
	}
	const consumerNotes = instructions.consumerNotes?.trim();
	if (consumerNotes !== undefined && consumerNotes.length > 0) {
		lines.push(consumerNotes);
	}
	return lines;
}

function reviewPreamble(args: {
	plan: Plan;
	commentBody?: string;
	axis?: ReviewAxis;
	incremental: boolean;
	priorReview?: PriorReviewContext;
}): string[] {
	switch (args.plan.kind) {
		case "review": {
			if (args.axis === undefined) {
				throw new Error("review prompts require a Standards or Spec axis");
			}
			return [
				"You are hakasebot, a pull request reviewer.",
				args.incremental
					? "Review only the incremental diff since the prior posted review on this pull request."
					: "Review the checked-out repository diff for this pull request.",
				args.axis === "standards"
					? standardsReviewGuidance(args.incremental)
					: specReviewGuidance(args.incremental),
				githubFindingsGuidance(args.axis),
				...(args.priorReview === undefined
					? []
					: incrementalReviewContextLines(args.priorReview)),
			];
		}
		case "mention": {
			return [
				"You are hakasebot, a coding assistant on a pull request.",
				`The user mentioned you in PR comment #${String(args.plan.commentId)}.`,
				args.commentBody === undefined
					? "Address their request in the repository context."
					: `Comment body:\n${args.commentBody}`,
			];
		}
		case "fix": {
			return [
				"You are hakasebot, a coding assistant on a pull request.",
				`The user asked you to fix an issue in review comment #${String(args.plan.commentId)}.`,
				args.commentBody === undefined
					? "Apply a fix in the repository and describe it."
					: `Comment body:\n${args.commentBody}`,
				"Prefer patch findings with suggestion replacements where appropriate.",
			];
		}
		default: {
			return exhaustive(args.plan);
		}
	}
}

export function buildReviewPrompt(args: {
	plan: Plan;
	commentBody?: string;
	instructions?: ReviewInstructions;
	axis?: ReviewAxis;
	homeDir: string;
	priorReview?: PriorReviewContext;
	reportPath: string;
}): string {
	const incremental = args.priorReview !== undefined;
	return [
		...reviewPreamble({ ...args, incremental }),
		...reviewInstructionLines(args.instructions),
		...engineScriptsPromptLines({ homeDir: args.homeDir, incremental }),
		"Write summary and finding bodies in a neutral technical voice.",
		"Do not add cute framing, greetings, or sign-offs.",
		"The Review runtime drops findings on path ignore globs, missing or out-of-range lines, lines not in the pull diff, and no-op patches.",
		`Write the review report as UTF-8 JSON to this absolute path (create or overwrite): ${args.reportPath}`,
		"Do not wrap the file contents in markdown fences. Stdout is not the report.",
		"The file must contain ONLY valid JSON matching this schema:",
		REPORT_SCHEMA,
	].join("\n");
}
