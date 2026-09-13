import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { parseCliReport } from "@hakasebot/core/review.server.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { afterEach, expect, test } from "vitest";

import {
	applyReportChecks,
	commentableLinesFromPullFiles,
	normalizeFindingPath,
	pathMatchesIgnore,
	rightSideLinesFromPatch,
} from "#/report-checks.ts";

const THREE_LINE_PATCH = [
	"@@ -1,3 +1,3 @@",
	" line1",
	"-old",
	"+new",
	" line3",
].join("\n");

const TWO_LINE_PATCH = ["@@ -1,2 +1,2 @@", " line1", "-old", "+new"].join("\n");

function reportFrom(json: unknown) {
	return must(
		parseCliReport({
			engine: "claude",
			raw: JSON.stringify(json),
		}),
	);
}

let checkoutDir: string | undefined;

afterEach(async () => {
	if (checkoutDir !== undefined) {
		await rm(checkoutDir, { recursive: true, force: true });
		checkoutDir = undefined;
	}
});

async function writeCheckout(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "hakase-checks-"));
	checkoutDir = root;
	await Promise.all(
		Object.entries(files).map(async ([rel, contents]) => {
			const abs = path.join(root, rel);
			await mkdir(path.dirname(abs), { recursive: true });
			await Bun.write(abs, contents);
		}),
	);
	return root;
}

test("normalizeFindingPath rejects absolute, parent, and empty paths", () => {
	expect(normalizeFindingPath("src/x.ts")).toBe("src/x.ts");
	expect(normalizeFindingPath("./src/x.ts")).toBe("src/x.ts");
	expect(normalizeFindingPath("/etc/passwd")).toBeUndefined();
	expect(normalizeFindingPath("../secret")).toBeUndefined();
	expect(normalizeFindingPath("src/../../etc/passwd")).toBeUndefined();
	expect(normalizeFindingPath("")).toBeUndefined();
});

test("pathMatchesIgnore treats slash-less globs as any-depth", () => {
	expect(pathMatchesIgnore("CHANGELOG.md", ["CHANGELOG.md"])).toBe(true);
	expect(pathMatchesIgnore("docs/CHANGELOG.md", ["CHANGELOG.md"])).toBe(true);
	expect(pathMatchesIgnore("src/x.ts", ["*.md"])).toBe(false);
	expect(pathMatchesIgnore("docs/a.md", ["*.md"])).toBe(true);
	expect(pathMatchesIgnore("docs/a.md", ["docs/**"])).toBe(true);
	expect(pathMatchesIgnore("docs/a.md", ["docs/"])).toBe(true);
	expect(pathMatchesIgnore("src/x.ts", ["docs/"])).toBe(false);
});

test("rightSideLinesFromPatch collects context and added head lines", () => {
	const lines = rightSideLinesFromPatch(THREE_LINE_PATCH);
	expect([...lines].toSorted((left, right) => left - right)).toEqual([1, 2, 3]);
});

test("rightSideLinesFromPatch treats empty hunk rows as context", () => {
	const patch = [
		"@@ -1,4 +1,4 @@",
		" line1",
		"",
		"-old",
		"+new",
		" line4",
	].join("\n");
	const lines = rightSideLinesFromPatch(patch);
	expect([...lines].toSorted((left, right) => left - right)).toEqual([
		1, 2, 3, 4,
	]);
});

test("rightSideLinesFromPatch ignores a trailing newline from split", () => {
	const patch = `${["@@ -1,3 +1,3 @@", " line1", "-old", "+new", " line3"].join(
		"\n",
	)}\n`;
	const lines = rightSideLinesFromPatch(patch);
	expect([...lines].toSorted((left, right) => left - right)).toEqual([1, 2, 3]);
});

test("applyReportChecks drops ignored, missing, out-of-range, and no-op patches", async () => {
	const root = await writeCheckout({
		"src/keep.ts": "alpha\nbeta\n",
		"CHANGELOG.md": "notes\n",
	});
	const report = reportFrom({
		summary: "review",
		findings: [
			{
				kind: "note",
				path: "src/keep.ts",
				start: 1,
				lineCount: 1,
				body: "keep this",
			},
			{
				kind: "note",
				path: "CHANGELOG.md",
				start: 1,
				lineCount: 1,
				body: "skip changelog",
			},
			{
				kind: "note",
				path: "src/missing.ts",
				start: 1,
				lineCount: 1,
				body: "gone",
			},
			{
				kind: "note",
				path: "src/keep.ts",
				start: 99,
				lineCount: 1,
				body: "oob",
			},
			{
				kind: "patch",
				path: "src/keep.ts",
				start: 2,
				lineCount: 1,
				body: "same text",
				replacement: "beta\n",
			},
			{
				kind: "note",
				path: "/etc/passwd",
				start: 1,
				lineCount: 1,
				body: "absolute",
			},
		],
	});
	const checked = await applyReportChecks({
		report,
		checkoutRoot: root,
		ignorePaths: ["CHANGELOG.md"],
	});
	expect(checked.findings).toHaveLength(1);
	expect(checked.findings[0]?.path).toBe("src/keep.ts");
	expect(checked.findings[0]?.range.start).toBe(1);
	expect(checked.summary).toContain("Dropped 5 findings");
});

test("applyReportChecks drops findings whose lines are not on the pull head", async () => {
	const root = await writeCheckout({
		"src/keep.ts": "alpha\nbeta\ngamma\n",
	});
	const report = reportFrom({
		summary: "review",
		findings: [
			{
				kind: "note",
				path: "src/keep.ts",
				start: 2,
				lineCount: 1,
				body: "on the diff",
			},
			{
				kind: "note",
				path: "src/keep.ts",
				start: 3,
				lineCount: 1,
				body: "unchanged line",
			},
		],
	});
	const commentable = commentableLinesFromPullFiles([
		{
			filename: "src/keep.ts",
			status: "modified",
			patch: TWO_LINE_PATCH,
		},
	]);
	const checked = await applyReportChecks({
		report,
		checkoutRoot: root,
		commentableLines: commentable,
	});
	expect(checked.findings).toHaveLength(1);
	expect(checked.findings[0]?.range.start).toBe(2);
	expect(checked.summary).toContain("Dropped 1 finding");
});

test("applyReportChecks drops every finding when the pull file list is empty", async () => {
	const root = await writeCheckout({
		"src/keep.ts": "alpha\nbeta\n",
	});
	const report = reportFrom({
		summary: "review",
		findings: [
			{
				kind: "note",
				path: "src/keep.ts",
				start: 1,
				lineCount: 1,
				body: "keep this",
			},
		],
	});
	const checked = await applyReportChecks({
		report,
		checkoutRoot: root,
		commentableLines: new Map(),
	});
	expect(checked.findings).toEqual([]);
	expect(checked.summary).toContain("Dropped 1 finding");
});
