import { z } from "zod";

import {
	commentMarkdown,
	exhaustive,
	lineCount,
	lineNumber,
	lineRange,
	replacementText,
	repoPath,
} from "#/domain.ts";
import type { EngineKind, Finding, ReviewReport } from "#/domain.ts";
import { formatZodError } from "#/zod-parse.ts";

export function consumerNotesFilename(): string {
	return ".hakasebot.md";
}

export const REVIEW_REPORT_FILENAME = "review-report.json";

const noteFindingWireSchema = z
	.object({
		kind: z.literal("note"),
		path: z.string().min(1),
		start: z.number().int().positive(),
		lineCount: z.number().int().positive(),
		body: z.string().min(1),
	})
	.strict();

const patchFindingWireSchema = z
	.object({
		kind: z.literal("patch"),
		path: z.string().min(1),
		start: z.number().int().positive(),
		lineCount: z.number().int().positive(),
		body: z.string().min(1),
		replacement: z.string(),
	})
	.strict();

export const reviewReportWireSchema = z
	.object({
		summary: z.string().min(1),
		findings: z.array(
			z.discriminatedUnion("kind", [
				noteFindingWireSchema,
				patchFindingWireSchema,
			]),
		),
	})
	.strict();

const reviewReportShapeSchema = z.object({
	findings: z.array(z.unknown()),
	summary: z.string(),
});

export function isReviewReportShape(value: unknown): boolean {
	return reviewReportShapeSchema.safeParse(value).success;
}

type ReportWire = z.infer<typeof reviewReportWireSchema>;
type FindingWire = ReportWire["findings"][number];

function brandFinding(item: FindingWire): Finding {
	const path = repoPath(item.path);
	const start = lineNumber(item.start);
	const count = lineCount(item.lineCount);
	if (
		path.kind === "invalid" ||
		start.kind === "invalid" ||
		count.kind === "invalid"
	) {
		throw new RangeError("report has an invalid finding");
	}
	const base = {
		body: commentMarkdown(item.body),
		path: path.value,
		range: lineRange({ start: start.value, lineCount: count.value }),
	};
	if (item.kind === "note") {
		return { kind: "note", ...base };
	}
	return {
		kind: "patch",
		...base,
		suggestion: { replacement: replacementText(item.replacement) },
	};
}

function parseCliReportJson(args: {
	engine: EngineKind;
	raw: string;
}): { kind: "ok"; value: ReviewReport } | { kind: "invalid"; message: string } {
	let parsed: unknown;
	try {
		parsed = JSON.parse(args.raw);
	} catch {
		return {
			kind: "invalid",
			message: `${args.engine} report is not valid JSON`,
		};
	}
	const wire = reviewReportWireSchema.safeParse(parsed);
	if (!wire.success) {
		return {
			kind: "invalid",
			message: `${args.engine} report failed schema: ${formatZodError(wire.error, "report")}`,
		};
	}
	try {
		return {
			kind: "ok",
			value: {
				summary: commentMarkdown(wire.data.summary),
				findings: wire.data.findings.map(brandFinding),
			},
		};
	} catch (error) {
		return {
			kind: "invalid",
			message:
				error instanceof Error
					? `${args.engine} ${error.message}`
					: `${args.engine} report has an invalid finding`,
		};
	}
}

export function parseCliReport(args: {
	engine: EngineKind;
	raw: string;
}): { kind: "ok"; value: ReviewReport } | { kind: "invalid"; message: string } {
	switch (args.engine) {
		case "claude":
		case "codex":
		case "grok":
		case "cursor":
		case "antigravity": {
			return parseCliReportJson(args);
		}
		default: {
			return exhaustive(args.engine);
		}
	}
}

function ensureAxisPrefix(
	finding: Finding,
	axis: "Standards" | "Spec",
): Finding {
	const prefix = `${axis}:`;
	if (
		finding.body.startsWith(prefix) ||
		finding.body.startsWith(`**${axis}:**`)
	) {
		return finding;
	}
	const body = commentMarkdown(`${prefix} ${finding.body}`);
	return { ...finding, body };
}

/** Concatenate Standards and Spec reports without cross-axis reranking. */
export function mergeAxisReports(args: {
	standards: ReviewReport;
	spec: ReviewReport;
}): ReviewReport {
	const summary = commentMarkdown(
		[
			"## Standards",
			args.standards.summary,
			"",
			"## Spec",
			args.spec.summary,
			"",
			`Standards: ${String(args.standards.findings.length)} findings. Spec: ${String(args.spec.findings.length)} findings.`,
		].join("\n"),
	);
	return {
		summary,
		findings: [
			...args.standards.findings.map((finding) =>
				ensureAxisPrefix(finding, "Standards"),
			),
			...args.spec.findings.map((finding) => ensureAxisPrefix(finding, "Spec")),
		],
	};
}
