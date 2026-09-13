import type { JobHome } from "#/job-home.ts";

import { writeAuthJson } from "./auth-json.ts";
import type { EngineOf } from "./job-ctx.ts";

export function grokArgv(args: {
	engine: EngineOf<"grok">;
	prompt: string;
}): string[] {
	return [
		"-p",
		args.prompt,
		"--output-format",
		"json",
		"--model",
		args.engine.model,
		"--always-approve",
	];
}

export async function writeGrokCredentialFiles(args: {
	engine: EngineOf<"grok">;
	home: JobHome;
}): Promise<void> {
	await writeAuthJson({
		credential: args.engine.credential,
		dirname: ".grok",
		home: args.home,
	});
}
