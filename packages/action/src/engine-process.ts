import path from "node:path";

import { errorMessage } from "@hakasebot/core/error-message.ts";

import { readStreamText } from "./bun-stream.ts";
import { engineScriptsDir } from "./engine-scripts.ts";

const FAILED_DETAIL_MAX = 300;

const ENGINE_CHILD_ENV_KEYS = [
	"PATH",
	"PATHEXT",
	"TMPDIR",
	"TEMP",
	"TMP",
	"LANG",
	"LC_ALL",
	"LC_CTYPE",
	"TZ",
	"TERM",
	"CI",
	"HTTP_PROXY",
	"HTTPS_PROXY",
	"NO_PROXY",
	"http_proxy",
	"https_proxy",
	"no_proxy",
	"SSL_CERT_FILE",
	"SSL_CERT_DIR",
	"NODE_EXTRA_CA_CERTS",
	"XDG_CACHE_HOME",
	"XDG_CONFIG_HOME",
	"XDG_DATA_HOME",
] as const;

export function allowlistedChildEnv(
	parent: Record<string, string | undefined>,
): Record<string, string> {
	const env: Record<string, string> = {};
	for (const key of ENGINE_CHILD_ENV_KEYS) {
		const value = parent[key];
		if (value !== undefined && value !== "") {
			env[key] = value;
		}
	}
	return env;
}

export function engineChildEnv(args: {
	engineEnv: Record<string, string>;
	home: string;
	parent: Record<string, string | undefined>;
}): Record<string, string> {
	const merged: Record<string, string> = {
		...allowlistedChildEnv(args.parent),
		...args.engineEnv,
		HOME: args.home,
	};
	const bin = engineScriptsDir(args.home);
	const existing = merged["PATH"];
	merged["PATH"] =
		existing !== undefined && existing.length > 0
			? `${bin}${path.delimiter}${existing}`
			: bin;
	return merged;
}

export function redactEngineFailureDetail(args: {
	detail: string;
	secrets: readonly string[];
}): string {
	const secrets = [...args.secrets]
		.filter((secret) => secret.length > 0)
		.toSorted((left, right) => right.length - left.length);
	let text = args.detail;
	for (const secret of secrets) {
		text = text.split(secret).join("***");
	}
	const trimmed = text.trim();
	if (trimmed.length <= FAILED_DETAIL_MAX) {
		return trimmed;
	}
	return `${trimmed.slice(0, FAILED_DETAIL_MAX)}...`;
}

export function secretValuesForRedact(args: {
	credential: string;
	env: Record<string, string>;
}): string[] {
	const values = [args.credential];
	for (const [key, value] of Object.entries(args.env)) {
		if (key === "HOME") {
			continue;
		}
		if (value.length > 0) {
			values.push(value);
		}
	}
	return values;
}

export function looksLikeAuthFailure(args: {
	engine: "codex" | "grok";
	exitCode: number;
	stderr: string;
	stdout: string;
}): boolean {
	if (args.exitCode === 0) {
		return false;
	}
	const text = `${args.stderr}\n${args.stdout}`.toLowerCase();
	return /(?:auth|expired|login|unauthorized|invalid.?token|401|403)/u.test(
		text,
	);
}

export async function spawnCaptured(args: {
	binary: string;
	argv: readonly string[];
	cwd: string;
	env: Record<string, string>;
}): Promise<
	| { kind: "ok"; stdout: string; stderr: string; exitCode: number }
	| { kind: "spawn-error"; message: string }
> {
	try {
		const child = Bun.spawn([args.binary, ...args.argv], {
			cwd: args.cwd,
			env: args.env,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			readStreamText(child.stdout),
			readStreamText(child.stderr),
		]);
		return {
			kind: "ok",
			stdout,
			stderr,
			exitCode,
		};
	} catch (error) {
		return {
			kind: "spawn-error",
			message: errorMessage(error, "spawn failed"),
		};
	}
}
