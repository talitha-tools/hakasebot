import path from "node:path";

import type { JobHome } from "#/job-home.ts";

import { writeAuthJson } from "./auth-json.ts";
import type { EngineJobCtx, EngineOf } from "./job-ctx.ts";

export function codexConfigToml(homeDir: string): string {
	return [
		'approval_policy = "never"',
		'sandbox_mode = "workspace-write"',
		"",
		"[sandbox_workspace_write]",
		"network_access = false",
		`writable_roots = ["${homeDir}"]`,
		"",
	].join("\n");
}

export function codexArgv(args: {
	ctx: EngineJobCtx;
	engine: EngineOf<"codex">;
	prompt: string;
}): string[] {
	return [
		"exec",
		"--sandbox",
		"workspace-write",
		"--ask-for-approval",
		"never",
		"--add-dir",
		args.ctx.homeDir,
		"--model",
		args.engine.model,
		...(args.engine.fast ? ["--fast"] : []),
		"--",
		args.prompt,
	];
}

export async function writeCodexCredentialFiles(args: {
	engine: EngineOf<"codex">;
	home: JobHome;
}): Promise<void> {
	await writeAuthJson({
		home: args.home,
		dirname: ".codex",
		credential: args.engine.credential,
	});
	await Bun.write(
		path.join(args.home.root, ".codex", "config.toml"),
		codexConfigToml(args.home.root),
	);
}
