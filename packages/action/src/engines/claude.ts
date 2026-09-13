import { mkdir } from "node:fs/promises";
import path from "node:path";

import { REVIEW_REPORT_FILENAME } from "@hakasebot/core/review.server.ts";

import { engineScriptPaths } from "#/engine-scripts.ts";
import type { JobHome } from "#/job-home.ts";

import type { EngineJobCtx, EngineOf } from "./job-ctx.ts";
import { writesWorkspace } from "./job-ctx.ts";

export function claudeAllowedTools(ctx: EngineJobCtx): string[] {
	const scripts = engineScriptPaths(ctx.homeDir).map(
		(scriptPath) => `Bash(${scriptPath}:*)`,
	);
	if (writesWorkspace(ctx.plan)) {
		return ["Read", "Grep", "Glob", "Edit", "Write", ...scripts];
	}
	const reportPath = path.join(ctx.homeDir, REVIEW_REPORT_FILENAME);
	return ["Read", "Grep", "Glob", `Write(${reportPath})`, ...scripts];
}

export function claudeSettingsJson(
	args: EngineJobCtx & { fast: boolean },
): string {
	const settings: {
		fastMode?: boolean;
		permissions: { allow: string[]; defaultMode: "dontAsk" };
	} = {
		permissions: {
			allow: claudeAllowedTools(args),
			defaultMode: "dontAsk",
		},
	};
	if (args.fast) {
		settings.fastMode = true;
	}
	return JSON.stringify(settings);
}

export function claudeArgv(args: {
	ctx: EngineJobCtx;
	engine: EngineOf<"claude">;
	prompt: string;
}): string[] {
	return [
		"-p",
		args.prompt,
		"--output-format",
		"json",
		"--model",
		args.engine.model,
		"--effort",
		args.engine.effort,
		"--permission-mode",
		"dontAsk",
		"--allowedTools",
		claudeAllowedTools(args.ctx).join(","),
	];
}

export function claudeCredentialEnv(
	engine: EngineOf<"claude">,
): Record<string, string> {
	return { CLAUDE_CODE_OAUTH_TOKEN: engine.credential };
}

export async function writeClaudeCredentialFiles(args: {
	ctx: EngineJobCtx;
	engine: EngineOf<"claude">;
	home: JobHome;
}): Promise<void> {
	const settingsDir = path.join(args.home.root, ".claude");
	await mkdir(settingsDir, { recursive: true });
	await Bun.write(
		path.join(settingsDir, "settings.json"),
		claudeSettingsJson({ fast: args.engine.fast, ...args.ctx }),
	);
}
