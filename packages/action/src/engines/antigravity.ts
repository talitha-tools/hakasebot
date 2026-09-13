import { mkdir } from "node:fs/promises";
import path from "node:path";

import { isReviewReportShape } from "@hakasebot/core/review.server.ts";
import { z } from "zod";

import { REPORT_JSON_SCHEMA } from "#/engine-prompt.ts";
import type { JobHome } from "#/job-home.ts";

import type { EngineOf } from "./job-ctx.ts";
import { extractJsonStdout } from "./json-stdout.ts";

export function antigravityArgv(args: {
	engine: EngineOf<"antigravity">;
	prompt: string;
}): string[] {
	return [
		"-p",
		args.prompt,
		"--model",
		args.engine.model,
		"--output-format",
		"json",
		"--json-schema",
		REPORT_JSON_SCHEMA,
		"--dangerously-skip-permissions",
	];
}

export function antigravityCredentialEnv(): Record<string, string> {
	return { GEMINI_FORCE_FILE_STORAGE: "true" };
}

export async function writeAntigravityCredentialFiles(args: {
	engine: EngineOf<"antigravity">;
	home: JobHome;
}): Promise<void> {
	const settingsDir = path.join(args.home.root, ".gemini", "antigravity-cli");
	await mkdir(settingsDir, { recursive: true });
	// Current `agy` reads jetski-standalone-oauth-token. Community docs still
	// use antigravity-oauth-token. Write both; they are the same blob.
	await Promise.all(
		(["antigravity-oauth-token", "jetski-standalone-oauth-token"] as const).map(
			async (name) =>
				Bun.write(path.join(settingsDir, name), args.engine.credential),
		),
	);
}

export function normalizeAntigravityStdout(stdout: string): string {
	const trimmed = stdout.trim();
	try {
		const envelope: unknown = JSON.parse(trimmed);
		const parsed = z
			.object({
				response: z.string().optional(),
				structured_output: z.unknown().optional(),
			})
			.safeParse(envelope);
		if (!parsed.success) {
			return extractJsonStdout(stdout);
		}
		if (isReviewReportShape(parsed.data.structured_output)) {
			return JSON.stringify(parsed.data.structured_output);
		}
		const { response } = parsed.data;
		if (typeof response === "string") {
			const fromResponse = extractJsonStdout(response);
			try {
				if (isReviewReportShape(JSON.parse(fromResponse))) {
					return fromResponse;
				}
			} catch {
				// fall through
			}
		}
	} catch {
		// fall through
	}
	return extractJsonStdout(stdout);
}
