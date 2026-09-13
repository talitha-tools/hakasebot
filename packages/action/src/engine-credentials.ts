import { exhaustive } from "@hakasebot/core/domain.ts";
import type { EngineConfig } from "@hakasebot/core/domain.ts";

import {
	antigravityCredentialEnv,
	writeAntigravityCredentialFiles,
} from "./engines/antigravity.ts";
import {
	claudeCredentialEnv,
	writeClaudeCredentialFiles,
} from "./engines/claude.ts";
import { writeCodexCredentialFiles } from "./engines/codex.ts";
import { cursorCredentialEnv } from "./engines/cursor.ts";
import { writeGrokCredentialFiles } from "./engines/grok.ts";
import type { EngineJobCtx } from "./engines/job-ctx.ts";
import type { JobHome } from "./job-home.ts";

function credentialEnv(engine: EngineConfig): Record<string, string> {
	switch (engine.kind) {
		case "claude": {
			return claudeCredentialEnv(engine);
		}
		case "cursor": {
			return cursorCredentialEnv(engine);
		}
		case "antigravity": {
			return antigravityCredentialEnv();
		}
		case "codex":
		case "grok": {
			return {};
		}
		default: {
			return exhaustive(engine);
		}
	}
}

async function writeCredentialFiles(args: {
	ctx: EngineJobCtx;
	engine: EngineConfig;
	home: JobHome;
}): Promise<void> {
	switch (args.engine.kind) {
		case "claude": {
			await writeClaudeCredentialFiles({
				ctx: args.ctx,
				engine: args.engine,
				home: args.home,
			});
			return;
		}
		case "antigravity": {
			await writeAntigravityCredentialFiles({
				engine: args.engine,
				home: args.home,
			});
			return;
		}
		case "codex": {
			await writeCodexCredentialFiles({
				engine: args.engine,
				home: args.home,
			});
			return;
		}
		case "grok": {
			await writeGrokCredentialFiles({
				engine: args.engine,
				home: args.home,
			});
			return;
		}
		case "cursor": {
			return;
		}
		default: {
			return exhaustive(args.engine);
		}
	}
}

export async function materializeCredentials(args: {
	ctx: EngineJobCtx;
	engine: EngineConfig;
	home: JobHome;
}): Promise<{ env: Record<string, string> }> {
	await writeCredentialFiles(args);
	return { env: { HOME: args.home.root, ...credentialEnv(args.engine) } };
}
