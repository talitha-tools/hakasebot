import path from "node:path";

import type {
	Bot,
	EngineKind,
	ParseResult,
	Phrases,
} from "@hakasebot/core/domain.ts";
import {
	DEFAULT_FIX_PHRASE,
	fixPhrase,
	githubAppId,
	githubAppPrivateKey,
	githubToken,
	triggerPhrase,
} from "@hakasebot/core/domain.ts";

import type { HomeRunInputs } from "./run-inputs.ts";

export function actionInput(
	env: Record<string, string | undefined>,
	name: string,
): string | undefined {
	const value = env[`INPUT_${name.toUpperCase()}`];
	if (value === undefined || value.length === 0) {
		return undefined;
	}
	return value;
}

export function uniqueEngines(kinds: readonly EngineKind[]): EngineKind[] {
	const seen = new Set<EngineKind>();
	const ordered: EngineKind[] = [];
	for (const kind of kinds) {
		if (seen.has(kind)) {
			continue;
		}
		seen.add(kind);
		ordered.push(kind);
	}
	return ordered;
}

export function readBot(args: {
	env: Record<string, string | undefined>;
	installationId: HomeRunInputs["installationId"];
}): ParseResult<Bot> {
	const appIdRaw = actionInput(args.env, "github_app_id");
	const appKeyRaw = actionInput(args.env, "github_app_private_key");
	if (appIdRaw !== undefined && appKeyRaw !== undefined) {
		const appId = githubAppId(appIdRaw);
		if (appId.kind === "invalid") {
			return appId;
		}
		const privateKey = githubAppPrivateKey(appKeyRaw);
		if (privateKey.kind === "invalid") {
			return privateKey;
		}
		return {
			kind: "ok",
			value: {
				appId: appId.value,
				installationId: args.installationId,
				kind: "app",
				privateKey: privateKey.value,
			},
		};
	}
	const tokenRaw =
		actionInput(args.env, "github_token") ?? args.env["GITHUB_TOKEN"];
	if (tokenRaw === undefined) {
		return {
			kind: "invalid",
			message: "github app credentials or github_token required",
		};
	}
	const token = githubToken(tokenRaw);
	if (token.kind === "invalid") {
		return token;
	}
	return { kind: "ok", value: { kind: "actions-bot", token: token.value } };
}

export async function readWorkspaceFile(args: {
	dir: string;
	path: string;
}): Promise<string | undefined> {
	try {
		return await Bun.file(path.join(args.dir, args.path)).text();
	} catch {
		return undefined;
	}
}

export function phrasesFromEnv(
	env: Record<string, string | undefined>,
): ParseResult<Phrases | undefined> {
	const triggerRaw = actionInput(env, "trigger_phrase");
	const fixRaw = actionInput(env, "fix_phrase");
	if (triggerRaw === undefined) {
		return { kind: "ok", value: undefined };
	}
	const trigger = triggerPhrase(triggerRaw);
	const fix = fixPhrase(fixRaw ?? DEFAULT_FIX_PHRASE);
	if (trigger.kind === "invalid") {
		return trigger;
	}
	if (fix.kind === "invalid") {
		return fix;
	}
	return { kind: "ok", value: { fix: fix.value, trigger: trigger.value } };
}
