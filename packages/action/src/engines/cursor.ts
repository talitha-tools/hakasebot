import type { EngineJobCtx, EngineOf } from "./job-ctx.ts";
import { writesWorkspace } from "./job-ctx.ts";

export function cursorArgv(args: {
	ctx: EngineJobCtx;
	engine: EngineOf<"cursor">;
	prompt: string;
}): string[] {
	return [
		"-p",
		args.prompt,
		"--output-format",
		"json",
		"--model",
		args.engine.model,
		"--sandbox",
		"enabled",
		"--trust",
		...(writesWorkspace(args.ctx.plan) ? ["--force"] : []),
	];
}

export function cursorCredentialEnv(
	engine: EngineOf<"cursor">,
): Record<string, string> {
	// CursorLoginToken is the public login credential. Official headless
	// CI still reads CURSOR_API_KEY (or --api-key). Map the pasted login
	// artifact into that env; do not expose a second API-key-only engine.
	return { CURSOR_API_KEY: engine.credential };
}
