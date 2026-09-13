import { chmod, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { commitSha } from "@hakasebot/core/domain.ts";
import type {
	CommitSha,
	GithubToken,
	ParseResult,
	PullNumber,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import { errorMessage } from "@hakasebot/core/error-message.ts";

import { processEnv } from "#/action-env.ts";
import { readStreamText } from "#/bun-stream.ts";

import {
	deepenUntilAncestor,
	deepenUntilMergeBase,
	gitRevParseHead,
} from "./clone-shallow.ts";

const GITHUB_HTTPS = "https://github.com/";
const GIT_TOKEN_ENV = "HAKASE_GIT_TOKEN";

/**
 * Tokenless clone/fetch URL. Credentials are supplied at prompt time by the
 * askpass helper, never embedded in the URL: an embedded token is persisted
 * verbatim into `<checkout>/.git/config`, which the review engine (cwd = the
 * checkout, path-unrestricted read) could then read and exfiltrate through the
 * posted review.
 */
export function consumerRemoteUrl(repo: RepoRef): string {
	return `${GITHUB_HTTPS}${repo.owner}/${repo.name}.git`;
}

/**
 * Askpass helper answering git's HTTPS credential prompts from the environment.
 * It holds no secret: git runs it with the prompt text and it echoes the fixed
 * app-token username or the token from GIT_TOKEN_ENV. Askpass keeps the token
 * out of the remote URL, `.git/config`, and the process argv, and — unlike an
 * `http.extraheader` — touches no git config, so it can neither collide with
 * nor be shadowed by whatever config the runner already provides.
 */
export const ASKPASS_SCRIPT = `#!/bin/sh
case "$1" in
Username*) printf '%s' 'x-access-token' ;;
*) printf '%s' "$${GIT_TOKEN_ENV}" ;;
esac
`;

let askpassReady: Promise<string> | undefined;

async function writeAskpass(): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), "hakasebot-"));
	const file = path.join(dir, "git-askpass.sh");
	await writeFile(file, ASKPASS_SCRIPT);
	await chmod(file, 0o700);
	return file;
}

/**
 * Write the (secret-free) askpass helper once into a private 0700 dir and
 * return its path. Memoized for the process lifetime — one review run — which
 * is a one-shot Actions job whose container is discarded afterwards, so the
 * helper is not unlinked. A failed write is not cached, so a transient error
 * on one git op does not disable auth for the rest of the run.
 */
async function ensureAskpass(): Promise<string> {
	askpassReady ??= writeAskpass();
	try {
		return await askpassReady;
	} catch (error: unknown) {
		askpassReady = undefined;
		throw error;
	}
}

/**
 * Env that lets a git spawn authenticate to github.com via {@link ASKPASS_SCRIPT}.
 * The token travels only in this child's environment (never argv, URL, or
 * `.git/config`); the engine child env is a fixed allowlist that excludes these
 * keys, so a review engine never inherits them.
 */
export function gitAuthEnv(
	token: GithubToken,
	askpassPath: string,
): Record<string, string> {
	return {
		GIT_ASKPASS: askpassPath,
		[GIT_TOKEN_ENV]: token,
		GIT_TERMINAL_PROMPT: "0",
	};
}

function redactGitStderr(
	stderr: string,
	token: GithubToken | undefined,
): string {
	// Scrub any credentialed remote URL unconditionally (defense in depth), then
	// the specific token when one was in play.
	let text = stderr
		.trim()
		.replaceAll(/x-access-token:[^@]+@/gu, "x-access-token:***@");
	if (token !== undefined && token.length > 0) {
		text = text.split(token).join("***");
	}
	return text;
}

async function git(
	args: readonly string[],
	cwd: string | undefined,
	token: GithubToken | undefined,
): Promise<ParseResult<void>> {
	try {
		const env =
			token === undefined
				? undefined
				: { ...processEnv, ...gitAuthEnv(token, await ensureAskpass()) };
		const child = Bun.spawn(["git", ...args], {
			...(cwd === undefined ? {} : { cwd }),
			...(env === undefined ? {} : { env }),
			stdin: "ignore",
			// stdout is unused; ignore it so a large git stdout can't fill an
			// undrained pipe buffer and deadlock the spawn.
			stdout: "ignore",
			stderr: "pipe",
		});
		const [exitCode, stderr] = await Promise.all([
			child.exited,
			readStreamText(child.stderr),
		]);
		if (exitCode === 0) {
			return { kind: "ok", value: undefined };
		}
		const detail = redactGitStderr(stderr, token);
		return {
			kind: "invalid",
			message:
				detail.length > 0
					? `git exited ${String(exitCode)}: ${detail}`
					: `git exited ${String(exitCode)}`,
		};
	} catch (error: unknown) {
		return {
			kind: "invalid",
			message: errorMessage(error, "git spawn failed"),
		};
	}
}

export async function cloneConsumer(args: {
	dest: string;
	pullNumber: PullNumber;
	remoteUrl?: string;
	repo: RepoRef;
	sha: CommitSha | undefined;
	token: GithubToken;
}): Promise<ParseResult<void>> {
	await mkdir(args.dest, { recursive: true });
	const remoteUrl = args.remoteUrl ?? consumerRemoteUrl(args.repo);
	const cloned = await git(
		["clone", "--depth", "1", remoteUrl, args.dest],
		undefined,
		args.token,
	);
	if (cloned.kind === "invalid") {
		return cloned;
	}
	const pullRef = `pull/${String(args.pullNumber)}/head`;
	const fetched = await git(
		["fetch", "--depth", "1", "origin", pullRef],
		args.dest,
		args.token,
	);
	if (fetched.kind === "invalid") {
		return fetched;
	}
	// Checkout is local; no credentials needed once the refs are fetched.
	const checked =
		args.sha === undefined
			? await git(["checkout", "--force", "FETCH_HEAD"], args.dest, undefined)
			: await git(["checkout", "--force", args.sha], args.dest, undefined);
	if (checked.kind === "invalid") {
		return checked;
	}
	return deepenUntilMergeBase({
		cwd: args.dest,
		pullRef,
		runGit: async (argv) => git(argv, args.dest, args.token),
	});
}

export async function fetchCommitForDiff(args: {
	cwd: string;
	sha: CommitSha;
	token: GithubToken;
}): Promise<ParseResult<void>> {
	const fetched = await git(
		["fetch", "--depth", "1", "origin", args.sha],
		args.cwd,
		args.token,
	);
	if (fetched.kind === "invalid") {
		return fetched;
	}
	const headRaw = await gitRevParseHead(args.cwd);
	if (headRaw === undefined) {
		return { kind: "ok", value: undefined };
	}
	const descendant = commitSha(headRaw);
	if (descendant.kind === "invalid") {
		return { kind: "ok", value: undefined };
	}
	return deepenUntilAncestor({
		ancestor: args.sha,
		cwd: args.cwd,
		descendant: descendant.value,
		runGit: async (argv) => git(argv, args.cwd, args.token),
	});
}

export { isCommitAncestor } from "./clone-shallow.ts";
