import { constants } from "node:fs";
import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { commitSha, githubToken, pullNumber } from "@hakasebot/core/domain.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { afterEach, expect, test } from "vitest";

import {
	engineScriptPath,
	engineScriptPaths,
	engineScriptsDir,
	engineScriptsPromptLines,
	materializeEngineScripts,
} from "#/engine-scripts.ts";
import {
	cloneConsumer,
	fetchCommitForDiff,
	isCommitAncestor,
} from "#/home/clone-consumer.ts";
import {
	deepenUntilAncestor,
	deepenUntilMergeBase,
} from "#/home/clone-shallow.ts";

let scratch: string | undefined;

afterEach(async () => {
	if (scratch !== undefined) {
		await rm(scratch, { recursive: true, force: true });
		scratch = undefined;
	}
});

async function makeTemp(prefix: string): Promise<string> {
	const dir = await mkdtemp(path.join(tmpdir(), prefix));
	scratch = dir;
	return dir;
}

function git(cwd: string, gitArgv: string[]): string {
	const result = Bun.spawnSync(["git", ...gitArgv], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
	});
	if (result.exitCode !== 0) {
		throw new Error(
			result.stderr.toString() || `git ${gitArgv.join(" ")} failed`,
		);
	}
	return result.stdout.toString().trim();
}

test("materializeEngineScripts writes executable review-merge-base and review-diff", async () => {
	const home = await makeTemp("engine-scripts-home-");
	await materializeEngineScripts(home);
	expect(engineScriptsDir(home)).toBe(path.join(home, "bin"));
	expect(engineScriptPaths(home)).toEqual([
		path.join(home, "bin", "review-merge-base"),
		path.join(home, "bin", "review-diff"),
		path.join(home, "bin", "review-diff-since"),
	]);
	await Promise.all(
		engineScriptPaths(home).map(async (filePath) => {
			await access(filePath, constants.X_OK);
		}),
	);
});

test("engineScriptsPromptLines name absolute Engine script paths", () => {
	const home = "/tmp/job-home";
	const lines = engineScriptsPromptLines({ homeDir: home });
	expect(lines[0]).toContain("Engine scripts");
	expect(lines).toContain(
		`- Merge-base: ${engineScriptPath(home, "review-merge-base")}`,
	);
	expect(lines).toContain(`- Diff: ${engineScriptPath(home, "review-diff")}`);
});

test("review-merge-base and review-diff use origin/HEAD when present", async () => {
	const repo = await makeTemp("engine-scripts-repo-");
	git(repo, ["init", "-b", "main"]);
	git(repo, ["config", "user.email", "engine-scripts@example.com"]);
	git(repo, ["config", "user.name", "Engine Scripts"]);
	git(repo, ["config", "commit.gpgsign", "false"]);
	await Bun.write(path.join(repo, "file.txt"), "base\n");
	git(repo, ["add", "file.txt"]);
	git(repo, ["commit", "-m", "base"]);
	const main = git(repo, ["rev-parse", "HEAD"]);
	git(repo, ["update-ref", "refs/remotes/origin/HEAD", main]);
	git(repo, ["checkout", "-b", "feature"]);
	await Bun.write(path.join(repo, "file.txt"), "changed\n");
	git(repo, ["add", "file.txt"]);
	git(repo, ["commit", "-m", "change"]);

	const home = path.join(repo, "home");
	await materializeEngineScripts(home);
	const mergeBase = Bun.spawnSync(
		[engineScriptPath(home, "review-merge-base")],
		{
			cwd: repo,
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	expect(mergeBase.exitCode).toBe(0);
	expect(mergeBase.stdout.toString().trim()).toBe(main);

	const diff = Bun.spawnSync([engineScriptPath(home, "review-diff")], {
		cwd: repo,
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(diff.exitCode).toBe(0);
	expect(diff.stdout.toString()).toContain("-base");
	expect(diff.stdout.toString()).toContain("+changed");
});

test("review-merge-base falls back to HEAD when origin is missing", async () => {
	const repo = await makeTemp("engine-scripts-shallow-");
	git(repo, ["init", "-b", "main"]);
	git(repo, ["config", "user.email", "engine-scripts@example.com"]);
	git(repo, ["config", "user.name", "Engine Scripts"]);
	git(repo, ["config", "commit.gpgsign", "false"]);
	await Bun.write(path.join(repo, "file.txt"), "only\n");
	git(repo, ["add", "file.txt"]);
	git(repo, ["commit", "-m", "only"]);
	const head = git(repo, ["rev-parse", "HEAD"]);

	const home = path.join(repo, "home");
	await materializeEngineScripts(home);
	const mergeBase = Bun.spawnSync(
		[engineScriptPath(home, "review-merge-base")],
		{
			cwd: repo,
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	expect(mergeBase.exitCode).toBe(0);
	expect(mergeBase.stdout.toString().trim()).toBe(head);
});

async function makePullOrigin(root: string): Promise<{
	main: string;
	origin: string;
	pr1: string;
	pr3: string;
}> {
	const origin = path.join(root, "origin");
	await mkdir(origin);
	git(origin, ["init", "-b", "main"]);
	git(origin, ["config", "user.email", "engine-scripts@example.com"]);
	git(origin, ["config", "user.name", "Engine Scripts"]);
	git(origin, ["config", "commit.gpgsign", "false"]);
	await Bun.write(path.join(origin, "file.txt"), "base1\n");
	git(origin, ["add", "file.txt"]);
	git(origin, ["commit", "-m", "base1"]);
	await Bun.write(path.join(origin, "file.txt"), "base2\n");
	git(origin, ["add", "file.txt"]);
	git(origin, ["commit", "-m", "base2"]);
	const main = git(origin, ["rev-parse", "HEAD"]);
	git(origin, ["checkout", "-b", "feature"]);
	await Bun.write(path.join(origin, "file.txt"), "base2\npr1\n");
	git(origin, ["add", "file.txt"]);
	git(origin, ["commit", "-m", "pr1"]);
	const pr1 = git(origin, ["rev-parse", "HEAD"]);
	await Bun.write(path.join(origin, "file.txt"), "base2\npr1\npr2\n");
	git(origin, ["add", "file.txt"]);
	git(origin, ["commit", "-m", "pr2"]);
	await Bun.write(path.join(origin, "file.txt"), "base2\npr1\npr2\npr3\n");
	git(origin, ["add", "file.txt"]);
	git(origin, ["commit", "-m", "pr3"]);
	const pr3 = git(origin, ["rev-parse", "HEAD"]);
	git(origin, ["checkout", "main"]);
	git(origin, ["update-ref", "refs/pull/4/head", pr3]);
	return { main, origin, pr1, pr3 };
}

test("cloneConsumer deepens a 3-commit pull so review-merge-base is not HEAD", async () => {
	const root = await makeTemp("engine-scripts-pr-");
	const { main, origin, pr3 } = await makePullOrigin(root);
	const dest = path.join(root, "dest");
	const pull = must(pullNumber(4));
	const sha = must(commitSha(pr3));
	const token = must(githubToken("ghs_local"));
	const cloned = await cloneConsumer({
		dest,
		pullNumber: pull,
		remoteUrl: pathToFileURL(origin).href,
		repo: testRepoRef("octo/consumer", "900301"),
		sha,
		token,
	});
	expect(cloned).toEqual({ kind: "ok", value: undefined });

	const home = path.join(root, "home");
	await materializeEngineScripts(home);
	const mergeBase = Bun.spawnSync(
		[engineScriptPath(home, "review-merge-base")],
		{
			cwd: dest,
			stdout: "pipe",
			stderr: "pipe",
		},
	);
	expect(mergeBase.exitCode).toBe(0);
	const found = mergeBase.stdout.toString().trim();
	expect(found).toBe(main);
	expect(found).not.toBe(pr3);
});

test("fetchCommitForDiff restores ancestry between two pull commits", async () => {
	const root = await makeTemp("engine-scripts-since-");
	const { origin, pr1, pr3 } = await makePullOrigin(root);
	const dest = path.join(root, "dest");
	const priorSha = must(commitSha(pr1));
	const headSha = must(commitSha(pr3));
	const token = must(githubToken("ghs_local"));
	git(root, ["clone", "--depth", "1", pathToFileURL(origin).href, dest]);
	git(dest, ["fetch", "--depth", "1", "origin", "pull/4/head"]);
	git(dest, ["checkout", "--force", "FETCH_HEAD"]);
	expect(
		await isCommitAncestor({
			ancestor: priorSha,
			cwd: dest,
			descendant: headSha,
		}),
	).toBe(false);

	const fetched = await fetchCommitForDiff({
		cwd: dest,
		sha: priorSha,
		token,
	});
	expect(fetched).toEqual({ kind: "ok", value: undefined });
	expect(
		await isCommitAncestor({
			ancestor: priorSha,
			cwd: dest,
			descendant: headSha,
		}),
	).toBe(true);
});

test("deepenUntilMergeBase is invalid when merge-base never appears", async () => {
	const repo = await makeTemp("engine-scripts-no-base-");
	git(repo, ["init", "-b", "main"]);
	git(repo, ["config", "user.email", "engine-scripts@example.com"]);
	git(repo, ["config", "user.name", "Engine Scripts"]);
	git(repo, ["config", "commit.gpgsign", "false"]);
	await Bun.write(path.join(repo, "file.txt"), "only\n");
	git(repo, ["add", "file.txt"]);
	git(repo, ["commit", "-m", "only"]);
	const result = await deepenUntilMergeBase({
		cwd: repo,
		pullRef: "pull/4/head",
		runGit: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
	});
	expect(result).toEqual({
		kind: "invalid",
		message: "merge-base is missing after deepening the clone",
	});
});

test("deepenUntilAncestor is invalid when the prior commit never appears", async () => {
	const repo = await makeTemp("engine-scripts-no-ancestor-");
	git(repo, ["init", "-b", "main"]);
	git(repo, ["config", "user.email", "engine-scripts@example.com"]);
	git(repo, ["config", "user.name", "Engine Scripts"]);
	git(repo, ["config", "commit.gpgsign", "false"]);
	await Bun.write(path.join(repo, "file.txt"), "only\n");
	git(repo, ["add", "file.txt"]);
	git(repo, ["commit", "-m", "only"]);
	const result = await deepenUntilAncestor({
		ancestor: must(commitSha("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")),
		cwd: repo,
		descendant: must(commitSha("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")),
		runGit: async () => {
			await Promise.resolve();
			return { kind: "ok", value: undefined };
		},
	});
	expect(result).toEqual({
		kind: "invalid",
		message: "prior commit is not an ancestor after deepening",
	});
});
