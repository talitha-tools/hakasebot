import { homedir } from "node:os";

import type { EngineKind } from "@hakasebot/core/domain.ts";
import { exhaustive } from "@hakasebot/core/domain.ts";
import { errorMessage } from "@hakasebot/core/error-message.ts";

import { processEnv } from "./action-env.ts";
import { readStreamText } from "./bun-stream.ts";
import { allowlistedChildEnv } from "./engine-process.ts";

export type InstallStep =
	| { kind: "curl-bash"; url: string }
	| { kind: "npm-global"; packageName: string };

export interface InstallRecipe {
	binary: string;
	searchDirs: readonly string[];
	steps: readonly InstallStep[];
}

export type PrepareResult =
	| { kind: "ok"; installed: readonly EngineKind[] }
	| { kind: "invalid"; message: string };

export type RunShell = (
	script: string,
) =>
	| Promise<{ exitCode: number; stderr: string }>
	| { exitCode: number; stderr: string };

export interface InstallDeps {
	commandAvailable: (binary: string, pathEnv: string) => boolean;
	runShell: RunShell;
}

const INSTALL_RECIPES = {
	claude: {
		binary: "claude",
		searchDirs: ["$HOME/.local/bin"],
		steps: [
			{ kind: "curl-bash", url: "https://claude.ai/install.sh" },
			{ kind: "npm-global", packageName: "@anthropic-ai/claude-code" },
		],
	},
	codex: {
		binary: "codex",
		searchDirs: [],
		steps: [{ kind: "npm-global", packageName: "@openai/codex" }],
	},
	cursor: {
		binary: "agent",
		searchDirs: ["$HOME/.cursor/bin", "$HOME/.local/bin"],
		steps: [{ kind: "curl-bash", url: "https://cursor.com/install" }],
	},
	grok: {
		binary: "grok",
		searchDirs: ["$HOME/.local/bin"],
		steps: [{ kind: "curl-bash", url: "https://x.ai/cli/install.sh" }],
	},
	antigravity: {
		binary: "agy",
		searchDirs: ["$HOME/.local/bin"],
		steps: [
			{
				kind: "curl-bash",
				url: "https://antigravity.google/cli/install.sh",
			},
		],
	},
} satisfies Record<EngineKind, InstallRecipe>;

export function engineBinaryName(kind: EngineKind): string {
	return INSTALL_RECIPES[kind].binary;
}

export function engineBinaryOverride(
	kind: EngineKind,
	env: Readonly<Record<string, string | undefined>>,
): string | undefined {
	const global = env["HAKASEBOT_ENGINE_BIN"];
	if (global !== undefined && global.length > 0) {
		return global;
	}
	const perEngine = env[`HAKASEBOT_${kind.toUpperCase()}_BIN`];
	if (perEngine !== undefined && perEngine.length > 0) {
		return perEngine;
	}
	return undefined;
}

function expandHome(value: string): string {
	return value.replaceAll("$HOME", homedir());
}

function expandSearchDirs(recipe: InstallRecipe): string[] {
	return recipe.searchDirs.map(expandHome);
}

function hasEngineOverride(
	kind: EngineKind,
	env: Readonly<Record<string, string | undefined>>,
): boolean {
	return engineBinaryOverride(kind, env) !== undefined;
}

function installStepScript(step: InstallStep): string {
	switch (step.kind) {
		case "curl-bash": {
			return `curl -fsSL ${JSON.stringify(step.url)} | bash`;
		}
		case "npm-global": {
			return `npm install -g ${step.packageName}`;
		}
		default: {
			return exhaustive(step);
		}
	}
}

async function runRecipe(
	recipe: InstallRecipe,
	runShell: RunShell,
): Promise<void> {
	let lastMessage = "install failed";
	for (const step of recipe.steps) {
		// oxlint-disable-next-line eslint/no-await-in-loop -- steps are ordered fallbacks; stop at the first that succeeds
		const result = await runShell(installStepScript(step));
		if (result.exitCode === 0) {
			return;
		}
		lastMessage =
			result.stderr.trim().length > 0 ? result.stderr.trim() : lastMessage;
	}
	throw new Error(lastMessage);
}

function defaultCommandAvailable(binary: string, pathEnv: string): boolean {
	return Bun.which(binary, { PATH: pathEnv }) !== null;
}

const INSTALL_NPM_ENV_KEYS = [
	"npm_config_cache",
	"NPM_CONFIG_CACHE",
	"npm_config_prefix",
	"NPM_CONFIG_PREFIX",
] as const;

export function installChildEnv(
	parent: Record<string, string | undefined>,
): Record<string, string> {
	const env = allowlistedChildEnv(parent);
	for (const key of INSTALL_NPM_ENV_KEYS) {
		const value = parent[key];
		if (value !== undefined && value !== "") {
			env[key] = value;
		}
	}
	const home = parent["HOME"];
	env["HOME"] = home !== undefined && home.length > 0 ? home : homedir();
	return env;
}

async function defaultRunShell(
	script: string,
): Promise<{ exitCode: number; stderr: string }> {
	try {
		const child = Bun.spawn(["bash", "-lc", script], {
			env: installChildEnv(processEnv),
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stderr] = await Promise.all([
			child.exited,
			readStreamText(child.stderr),
		]);
		return { exitCode, stderr };
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		return { exitCode: 1, stderr: message };
	}
}

function effectivePath(args: {
	env: NodeJS.ProcessEnv;
	extraDirs: readonly string[];
}): string {
	const current = args.env["PATH"] ?? "";
	const prefix = args.extraDirs.join(":");
	if (prefix.length === 0) {
		return current;
	}
	if (current.length === 0) {
		return prefix;
	}
	return `${prefix}:${current}`;
}

function recipeAvailable(args: {
	recipe: InstallRecipe;
	pathEnv: string;
	commandAvailable: InstallDeps["commandAvailable"];
}): boolean {
	return args.commandAvailable(args.recipe.binary, args.pathEnv);
}

function publishPathDirs(args: {
	dirs: readonly string[];
	env: NodeJS.ProcessEnv;
}): void {
	const unique = [...new Set(args.dirs)];
	if (unique.length === 0) {
		return;
	}
	args.env["PATH"] = effectivePath({
		env: args.env,
		extraDirs: unique,
	});
}

async function ensureEngine(args: {
	deps: InstallDeps;
	env: NodeJS.ProcessEnv;
	kind: EngineKind;
	publishedDirs: readonly string[];
}): Promise<
	| { kind: "present"; searchDirs: string[] }
	| { kind: "installed"; searchDirs: string[] }
	| { kind: "invalid"; message: string }
> {
	const recipe = INSTALL_RECIPES[args.kind];
	const searchDirs = expandSearchDirs(recipe);
	const pathEnv = effectivePath({
		env: args.env,
		extraDirs: [...searchDirs, ...args.publishedDirs],
	});
	if (
		recipeAvailable({
			commandAvailable: args.deps.commandAvailable,
			pathEnv,
			recipe,
		})
	) {
		return { kind: "present", searchDirs };
	}
	try {
		await runRecipe(recipe, args.deps.runShell);
	} catch (error) {
		const message = errorMessage(error, `${args.kind} install failed`);
		return { kind: "invalid", message };
	}
	if (
		!recipeAvailable({
			commandAvailable: args.deps.commandAvailable,
			pathEnv,
			recipe,
		})
	) {
		return {
			kind: "invalid",
			message: `${args.kind} CLI is not on PATH after install`,
		};
	}
	return { kind: "installed", searchDirs };
}

export async function prepareEngines(args: {
	engines: readonly EngineKind[];
	env: NodeJS.ProcessEnv;
	deps?: Partial<InstallDeps>;
}): Promise<PrepareResult> {
	const deps: InstallDeps = {
		commandAvailable: defaultCommandAvailable,
		runShell: defaultRunShell,
		...args.deps,
	};
	const publishedDirs: string[] = [];
	const installed: EngineKind[] = [];

	for (const kind of args.engines) {
		if (hasEngineOverride(kind, args.env)) {
			continue;
		}
		// oxlint-disable-next-line eslint/no-await-in-loop -- installs run one at a time: they mutate shared PATH state and npm globals
		const ensured = await ensureEngine({
			deps,
			env: args.env,
			kind,
			publishedDirs,
		});
		if (ensured.kind === "invalid") {
			return ensured;
		}
		if (ensured.kind === "installed") {
			installed.push(kind);
		}
		publishedDirs.push(...ensured.searchDirs);
	}

	publishPathDirs({
		dirs: publishedDirs,
		env: args.env,
	});

	return { kind: "ok", installed };
}
