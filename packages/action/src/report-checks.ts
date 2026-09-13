import path from "node:path";

import { commentMarkdown, inclusiveEnd } from "@hakasebot/core/domain.ts";
import type {
	Finding,
	LineRange,
	ReviewReport,
} from "@hakasebot/core/domain.ts";
import type { PullFile } from "@hakasebot/core/github-api.server.ts";

function escapeRegex(value: string): string {
	return value.replaceAll(/[\\^$|?*+()[\]{}]/gu, String.raw`\$&`);
}

function globToRegExp(pattern: string): RegExp {
	let re = "^";
	let index = 0;
	while (index < pattern.length) {
		if (pattern.startsWith("**/", index)) {
			re += "(?:.*/)?";
			index += 3;
			continue;
		}
		if (pattern.startsWith("**", index) && index + 2 === pattern.length) {
			re += ".*";
			index += 2;
			continue;
		}
		const char = pattern[index];
		if (char === undefined) {
			break;
		}
		if (char === "*") {
			re += "[^/]*";
		} else if (char === "?") {
			re += "[^/]";
		} else {
			re += escapeRegex(char);
		}
		index += 1;
	}
	re += "$";
	return new RegExp(re, "u");
}

function posixRel(value: string): string {
	return value.trim().replaceAll("\\", "/").replace(/^\.\//u, "");
}

/** True when `relPath` matches a User ignore glob (gitignore-ish). */
export function pathMatchesIgnore(
	relPath: string,
	patterns: readonly string[],
): boolean {
	for (const raw of patterns) {
		const trimmed = posixRel(raw);
		if (trimmed.length === 0) {
			continue;
		}
		const directoryOnly = trimmed.endsWith("/") && trimmed.length > 1;
		const pattern = directoryOnly ? trimmed.slice(0, -1) : trimmed;
		const exact = globToRegExp(pattern);
		if (exact.test(relPath)) {
			return true;
		}
		if (directoryOnly) {
			const under = globToRegExp(`${pattern}/**`);
			if (under.test(relPath)) {
				return true;
			}
		}
		if (!pattern.includes("/")) {
			const anyDepth = globToRegExp(`**/${pattern}`);
			if (anyDepth.test(relPath)) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Relative path the Review runtime will accept. Rejects absolute paths,
 * `..`, NUL, and empty.
 */
export function normalizeFindingPath(value: string): string | undefined {
	const trimmed = posixRel(value);
	if (trimmed.length === 0) {
		return undefined;
	}
	if (trimmed.startsWith("/") || /^[A-Za-z]:/u.test(trimmed)) {
		return undefined;
	}
	const parts = trimmed
		.split("/")
		.filter((part) => part !== "" && part !== ".");
	if (parts.length === 0) {
		return undefined;
	}
	if (parts.some((part) => part === ".." || part.includes("\0"))) {
		return undefined;
	}
	return parts.join("/");
}

/** Right-side (head) line numbers GitHub will accept for a review comment. */
export function rightSideLinesFromPatch(patch: string): Set<number> {
	const lines = new Set<number>();
	let right = 0;
	let inHunk = false;
	const rows = patch.split("\n");
	for (const [index, row] of rows.entries()) {
		const header = /^@@ -\d+(?:,\d+)? \+(?<start>\d+)(?:,\d+)? @@/u.exec(row);
		if (header?.groups?.["start"] !== undefined) {
			right = Number(header.groups["start"]);
			inHunk = true;
			continue;
		}
		if (!inHunk) {
			continue;
		}
		if (row.startsWith("\\")) {
			continue;
		}
		if (row.length === 0) {
			if (index === rows.length - 1) {
				continue;
			}
			lines.add(right);
			right += 1;
			continue;
		}
		const [marker] = row;
		if (marker === "+" || marker === " ") {
			lines.add(right);
			right += 1;
			continue;
		}
		if (marker === "-") {
			continue;
		}
	}
	return lines;
}

export function commentableLinesFromPullFiles(
	files: readonly PullFile[],
): Map<string, ReadonlySet<number>> {
	const map = new Map<string, ReadonlySet<number>>();
	for (const file of files) {
		if (file.status === "removed") {
			continue;
		}
		const rel = normalizeFindingPath(file.filename);
		if (rel === undefined) {
			continue;
		}
		if (file.patch === undefined || file.patch.length === 0) {
			continue;
		}
		map.set(rel, rightSideLinesFromPatch(file.patch));
	}
	return map;
}

function fileLines(text: string): string[] {
	if (text.length === 0) {
		return [];
	}
	const parts = text.split("\n");
	if (parts.at(-1) === "") {
		parts.pop();
	}
	return parts;
}

function rangeLines(args: { lines: readonly string[]; range: LineRange }):
	| {
			kind: "ok";
			value: readonly string[];
	  }
	| { kind: "invalid" } {
	const { start } = args.range;
	const count = args.range.lineCount;
	if (start + count - 1 > args.lines.length) {
		return { kind: "invalid" };
	}
	return { kind: "ok", value: args.lines.slice(start - 1, start + count - 1) };
}

function resolveInsideCheckout(args: {
	checkoutRoot: string;
	relPath: string;
}): string | undefined {
	const root = path.resolve(args.checkoutRoot);
	const resolved = path.resolve(args.checkoutRoot, args.relPath);
	if (resolved === root) {
		return undefined;
	}
	const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
	if (!resolved.startsWith(prefix)) {
		return undefined;
	}
	return resolved;
}

/** The cited range must exist in the checked-out file; patches must change it. */
async function findingMatchesCheckout(args: {
	abs: string;
	finding: Finding;
}): Promise<boolean> {
	try {
		const handle = Bun.file(args.abs);
		const info = await handle.stat();
		if (!info.isFile()) {
			return false;
		}
		const text = await handle.text();
		const lines = fileLines(text);
		const cited = rangeLines({ lines, range: args.finding.range });
		if (cited.kind === "invalid") {
			return false;
		}
		if (args.finding.kind === "patch") {
			const next = fileLines(args.finding.suggestion.replacement);
			if (next.join("\n") === cited.value.join("\n")) {
				return false;
			}
		}
		return true;
	} catch {
		return false;
	}
}

async function passesReportChecks(args: {
	finding: Finding;
	checkoutRoot: string | undefined;
	ignorePaths: readonly string[];
	commentableLines: ReadonlyMap<string, ReadonlySet<number>> | undefined;
}): Promise<boolean> {
	const rel = normalizeFindingPath(args.finding.path);
	if (rel === undefined) {
		return false;
	}
	if (pathMatchesIgnore(rel, args.ignorePaths)) {
		return false;
	}
	if (args.commentableLines !== undefined) {
		const commentable = args.commentableLines.get(rel);
		if (commentable === undefined) {
			return false;
		}
		const { start } = args.finding.range;
		const end = inclusiveEnd(args.finding.range);
		if (!commentable.has(start) || !commentable.has(end)) {
			return false;
		}
	}
	if (args.checkoutRoot === undefined) {
		return true;
	}
	const abs = resolveInsideCheckout({
		checkoutRoot: args.checkoutRoot,
		relPath: rel,
	});
	if (abs === undefined) {
		return false;
	}
	return findingMatchesCheckout({ abs, finding: args.finding });
}

function withDroppedNote(args: {
	summary: ReviewReport["summary"];
	dropped: number;
}): ReviewReport["summary"] {
	if (args.dropped === 0) {
		return args.summary;
	}
	const noun = args.dropped === 1 ? "finding" : "findings";
	return commentMarkdown(
		`${args.summary}\n\nDropped ${String(args.dropped)} ${noun} that were ignored, out of range, or not on the pull diff.`,
	);
}

/**
 * Drop findings the Review runtime cannot post or that the User asked to skip.
 * Schema-invalid reports never reach here (ADR-0018).
 */
export async function applyReportChecks(args: {
	report: ReviewReport;
	checkoutRoot?: string;
	ignorePaths?: readonly string[];
	commentableLines?: ReadonlyMap<string, ReadonlySet<number>>;
}): Promise<ReviewReport> {
	const ignorePaths = args.ignorePaths ?? [];
	const verdicts = await Promise.all(
		args.report.findings.map(async (finding) =>
			passesReportChecks({
				finding,
				checkoutRoot: args.checkoutRoot,
				ignorePaths,
				commentableLines: args.commentableLines,
			}),
		),
	);
	const kept = args.report.findings.filter(
		(_finding, index) => verdicts[index] === true,
	);
	const dropped = args.report.findings.length - kept.length;
	if (dropped === 0) {
		return args.report;
	}
	return {
		summary: withDroppedNote({
			summary: args.report.summary,
			dropped,
		}),
		findings: kept,
	};
}
