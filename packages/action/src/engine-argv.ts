import { exhaustive } from "@hakasebot/core/domain.ts";
import type { EngineConfig } from "@hakasebot/core/domain.ts";

import { envValue } from "./action-env.ts";
import { antigravityArgv } from "./engines/antigravity.ts";
import { claudeArgv } from "./engines/claude.ts";
import { codexArgv } from "./engines/codex.ts";
import { cursorArgv } from "./engines/cursor.ts";
import { grokArgv } from "./engines/grok.ts";
import type { EngineJobCtx } from "./engines/job-ctx.ts";

const CODE_REVIEW_SKILL_PACKAGE = "mattpocock/skills";
const CODE_REVIEW_SKILL_NAME = "code-review";

/** Test override for the skills CLI; product-prefixed like other Action env keys. */
export const SKILLS_BIN_ENV = "HAKASEBOT_SKILLS_BIN";

export function skillsInstallArgv(): string[] {
	const installArgv = [
		"add",
		CODE_REVIEW_SKILL_PACKAGE,
		"--skill",
		CODE_REVIEW_SKILL_NAME,
		"--agent",
		"*",
		"-g",
		"-y",
		"--copy",
	];
	const override = envValue(SKILLS_BIN_ENV);
	if (override !== undefined) {
		return [override, ...installArgv];
	}
	return ["bunx", "skills", ...installArgv];
}

export function buildEngineArgv(args: {
	ctx: EngineJobCtx;
	engine: EngineConfig;
	prompt: string;
}): string[] {
	switch (args.engine.kind) {
		case "claude": {
			return claudeArgv({ ...args, engine: args.engine });
		}
		case "codex": {
			return codexArgv({ ...args, engine: args.engine });
		}
		case "grok": {
			return grokArgv({ engine: args.engine, prompt: args.prompt });
		}
		case "cursor": {
			return cursorArgv({ ...args, engine: args.engine });
		}
		case "antigravity": {
			return antigravityArgv({ engine: args.engine, prompt: args.prompt });
		}
		default: {
			return exhaustive(args.engine);
		}
	}
}
