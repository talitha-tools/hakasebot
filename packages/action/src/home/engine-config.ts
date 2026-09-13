import {
	antigravityOauthToken,
	authJsonBlob,
	claudeOauthToken,
	cursorLoginToken,
	exhaustive,
} from "@hakasebot/core/domain.ts";
import type {
	Effort,
	EngineConfig,
	EngineKind,
	ModelName,
	ParseResult,
} from "@hakasebot/core/domain.ts";

function mapCredential<C>(
	parsed: ParseResult<C>,
	build: (credential: C) => EngineConfig,
): ParseResult<EngineConfig> {
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return { kind: "ok", value: build(parsed.value) };
}

/** Engines whose config carries the fast flag. */
function fastEngineConfig(args: {
	effort: Effort;
	fast: boolean;
	kind: "claude" | "codex" | "cursor";
	model: ModelName;
	plaintext: string;
}): ParseResult<EngineConfig> {
	const base = { effort: args.effort, fast: args.fast, model: args.model };
	switch (args.kind) {
		case "claude": {
			return mapCredential(claudeOauthToken(args.plaintext), (credential) => ({
				...base,
				credential,
				kind: "claude",
			}));
		}
		case "codex": {
			return mapCredential(authJsonBlob(args.plaintext), (credential) => ({
				...base,
				credential,
				kind: "codex",
			}));
		}
		case "cursor": {
			return mapCredential(cursorLoginToken(args.plaintext), (credential) => ({
				...base,
				credential,
				kind: "cursor",
			}));
		}
		default: {
			return exhaustive(args.kind);
		}
	}
}

/** Engines that run at one speed; their config has no fast flag. */
function steadyEngineConfig(args: {
	effort: Effort;
	kind: "antigravity" | "grok";
	model: ModelName;
	plaintext: string;
}): ParseResult<EngineConfig> {
	const base = { effort: args.effort, model: args.model };
	switch (args.kind) {
		case "grok": {
			return mapCredential(authJsonBlob(args.plaintext), (credential) => ({
				...base,
				credential,
				kind: "grok",
			}));
		}
		case "antigravity": {
			return mapCredential(
				antigravityOauthToken(args.plaintext),
				(credential) => ({
					...base,
					credential,
					kind: "antigravity",
				}),
			);
		}
		default: {
			return exhaustive(args.kind);
		}
	}
}

export function engineConfigFromPlaintext(args: {
	effort: Effort;
	fast: boolean;
	kind: EngineKind;
	model: ModelName;
	plaintext: string;
}): ParseResult<EngineConfig> {
	switch (args.kind) {
		case "claude":
		case "codex":
		case "cursor": {
			return fastEngineConfig({ ...args, kind: args.kind });
		}
		case "antigravity":
		case "grok": {
			return steadyEngineConfig({
				effort: args.effort,
				kind: args.kind,
				model: args.model,
				plaintext: args.plaintext,
			});
		}
		default: {
			return exhaustive(args.kind);
		}
	}
}
