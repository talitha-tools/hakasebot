import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * POSIX Engine scripts materialized in job HOME. Site must not import this
 * module (enforced by oxlint no-restricted-imports).
 */
export const ENGINE_SCRIPT_NAMES = [
	"review-merge-base",
	"review-diff",
	"review-diff-since",
] as const;

export type EngineScriptName = (typeof ENGINE_SCRIPT_NAMES)[number];

export function engineScriptsDir(homeDir: string): string {
	return path.join(homeDir, "bin");
}

export function engineScriptPath(
	homeDir: string,
	name: EngineScriptName,
): string {
	return path.join(engineScriptsDir(homeDir), name);
}

export function engineScriptPaths(homeDir: string): string[] {
	return ENGINE_SCRIPT_NAMES.map((name) => engineScriptPath(homeDir, name));
}

const MERGE_BASE_SOURCE = `#!/bin/sh
set -eu
for ref in origin/HEAD origin/main origin/master
do
	base=$(git merge-base HEAD "$ref" 2>/dev/null || true)
	if [ -n "$base" ]
	then
		printf '%s\\n' "$base"
		exit 0
	fi
done
git rev-parse HEAD
`;

const DIFF_SOURCE = `#!/bin/sh
set -eu
bindir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
base=$("$bindir/review-merge-base")
git diff --no-color "$base"...HEAD
`;

const DIFF_SINCE_SOURCE = `#!/bin/sh
set -eu
: "\${REVIEW_SINCE_SHA:?set REVIEW_SINCE_SHA to the prior review commit}"
git diff --no-color "$REVIEW_SINCE_SHA" HEAD
`;

async function writeExecutable(file: string, contents: string): Promise<void> {
	await Bun.write(file, contents);
	await chmod(file, 0o755);
}

export async function materializeEngineScripts(homeDir: string): Promise<void> {
	const dir = engineScriptsDir(homeDir);
	await mkdir(dir, { recursive: true });
	await writeExecutable(
		engineScriptPath(homeDir, "review-merge-base"),
		MERGE_BASE_SOURCE,
	);
	await writeExecutable(engineScriptPath(homeDir, "review-diff"), DIFF_SOURCE);
	await writeExecutable(
		engineScriptPath(homeDir, "review-diff-since"),
		DIFF_SINCE_SOURCE,
	);
}

export function engineScriptsPromptLines(args: {
	homeDir: string;
	incremental?: boolean;
}): string[] {
	const mergeBase = engineScriptPath(args.homeDir, "review-merge-base");
	const diff = engineScriptPath(
		args.homeDir,
		args.incremental === true ? "review-diff-since" : "review-diff",
	);
	return [
		"Inspect the pull with these Engine scripts only (absolute paths). Do not run other shell commands.",
		`- Merge-base: ${mergeBase}`,
		`- Diff: ${diff}`,
	];
}
