import type { CommitSha, ParseResult } from "@hakasebot/core/domain.ts";

import { readStreamText } from "#/bun-stream.ts";

export type ShallowGit = (
	argv: readonly string[],
) => Promise<ParseResult<void>>;

const DEEPEN_STEPS = [16, 32, 64, 128, 256, 512, 1024] as const;
const MERGE_BASE_REFS = [
	"origin/HEAD",
	"origin/main",
	"origin/master",
] as const;

export async function isCommitAncestor(args: {
	ancestor: CommitSha;
	cwd: string;
	descendant: CommitSha;
}): Promise<boolean> {
	try {
		const child = Bun.spawn(
			["git", "merge-base", "--is-ancestor", args.ancestor, args.descendant],
			{ cwd: args.cwd, stdin: "ignore", stdout: "ignore", stderr: "ignore" },
		);
		return (await child.exited) === 0;
	} catch {
		return false;
	}
}

async function gitMergeBaseExists(cwd: string): Promise<boolean> {
	for (const ref of MERGE_BASE_REFS) {
		try {
			const child = Bun.spawn(["git", "merge-base", "HEAD", ref], {
				cwd,
				stdin: "ignore",
				stdout: "ignore",
				stderr: "ignore",
			});
			// oxlint-disable-next-line eslint/no-await-in-loop -- try default-branch refs until one resolves
			if ((await child.exited) === 0) {
				return true;
			}
		} catch {
			continue;
		}
	}
	return false;
}

export async function gitRevParseHead(
	cwd: string,
): Promise<string | undefined> {
	try {
		const child = Bun.spawn(["git", "rev-parse", "HEAD"], {
			cwd,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "ignore",
		});
		const [exitCode, stdout] = await Promise.all([
			child.exited,
			readStreamText(child.stdout),
		]);
		if (exitCode !== 0) {
			return undefined;
		}
		const trimmed = stdout.trim();
		return trimmed.length === 0 ? undefined : trimmed;
	} catch {
		return undefined;
	}
}

async function deepenFetch(args: {
	deepen: number;
	ref: string | undefined;
	runGit: ShallowGit;
}): Promise<ParseResult<void>> {
	if (args.ref === undefined) {
		return args.runGit(["fetch", `--deepen=${String(args.deepen)}`, "origin"]);
	}
	return args.runGit([
		"fetch",
		`--deepen=${String(args.deepen)}`,
		"origin",
		args.ref,
	]);
}

export async function deepenUntilMergeBase(args: {
	cwd: string;
	pullRef: string;
	runGit: ShallowGit;
}): Promise<ParseResult<void>> {
	for (const deepen of DEEPEN_STEPS) {
		// oxlint-disable-next-line eslint/no-await-in-loop -- deepen until merge-base exists; later steps are larger
		if (await gitMergeBaseExists(args.cwd)) {
			return { kind: "ok", value: undefined };
		}
		// oxlint-disable-next-line eslint/no-await-in-loop -- origin history must deepen before the next check
		const origin = await deepenFetch({
			deepen,
			ref: undefined,
			runGit: args.runGit,
		});
		if (origin.kind === "invalid") {
			return origin;
		}
		// oxlint-disable-next-line eslint/no-await-in-loop -- pull history must deepen before the next check
		const pull = await deepenFetch({
			deepen,
			ref: args.pullRef,
			runGit: args.runGit,
		});
		if (pull.kind === "invalid") {
			return pull;
		}
	}
	if (await gitMergeBaseExists(args.cwd)) {
		return { kind: "ok", value: undefined };
	}
	return {
		kind: "invalid",
		message: "merge-base is missing after deepening the clone",
	};
}

export async function deepenUntilAncestor(args: {
	ancestor: CommitSha;
	cwd: string;
	descendant: CommitSha;
	runGit: ShallowGit;
}): Promise<ParseResult<void>> {
	for (const deepen of DEEPEN_STEPS) {
		if (
			// oxlint-disable-next-line eslint/no-await-in-loop -- stop once the prior commit is reachable from HEAD
			await isCommitAncestor({
				ancestor: args.ancestor,
				cwd: args.cwd,
				descendant: args.descendant,
			})
		) {
			return { kind: "ok", value: undefined };
		}
		// oxlint-disable-next-line eslint/no-await-in-loop -- HEAD history must deepen before the next ancestor check
		const headFetch = await deepenFetch({
			deepen,
			ref: args.descendant,
			runGit: args.runGit,
		});
		if (headFetch.kind === "invalid") {
			return headFetch;
		}
		// oxlint-disable-next-line eslint/no-await-in-loop -- prior sha must deepen before the next ancestor check
		const priorFetch = await deepenFetch({
			deepen,
			ref: args.ancestor,
			runGit: args.runGit,
		});
		if (priorFetch.kind === "invalid") {
			return priorFetch;
		}
	}
	if (
		await isCommitAncestor({
			ancestor: args.ancestor,
			cwd: args.cwd,
			descendant: args.descendant,
		})
	) {
		return { kind: "ok", value: undefined };
	}
	return {
		kind: "invalid",
		message: "prior commit is not an ancestor after deepening",
	};
}
