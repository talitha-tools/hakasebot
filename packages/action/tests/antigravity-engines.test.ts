import path from "node:path";

import {
	antigravityOauthToken,
	effort,
	engineKind,
	modelName,
	pullNumber,
} from "@hakasebot/core/domain.ts";
import type { EngineConfig } from "@hakasebot/core/domain.ts";
import { parseEngineSecretWrite } from "@hakasebot/core/engine-credential.ts";
import { parseCliReport } from "@hakasebot/core/review.server.ts";
import { engineSupportsFast } from "@hakasebot/core/vault/model-slot.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { expect, test } from "vitest";

import { materializeCredentials } from "#/engine-credentials.ts";
import {
	REPORT_JSON_SCHEMA,
	buildEngineArgv,
	extractJsonStdout,
	normalizeEngineStdout,
} from "#/engines.ts";
import { engineConfigFromPlaintext } from "#/home/engine-config.ts";
import { engineBinaryName } from "#/install-registry.ts";
import { createJobHome, destroyJobHome } from "#/job-home.ts";

const sampleOauth = JSON.stringify({
	auth_method: "consumer",
	token: {
		access_token: "ya29.test-access",
		expiry: "2099-01-01T00:00:00.000000000Z",
		refresh_token: "1//04-test-refresh",
		token_type: "Bearer",
	},
});

const sampleReport = {
	summary: "looks fine",
	findings: [
		{
			kind: "note",
			path: "src/a.ts",
			start: 1,
			lineCount: 1,
			body: "nit",
		},
	],
};

function antigravityConfig(fast: boolean): EngineConfig {
	const medium = must(effort("medium"));
	const model = must(modelName("gemini-3-flash"));
	return must(
		engineConfigFromPlaintext({
			effort: medium,
			fast,
			kind: "antigravity",
			model,
			plaintext: sampleOauth,
		}),
	);
}

function reviewCtx(homeDir: string) {
	return {
		homeDir,
		plan: { kind: "review" as const, pullNumber: must(pullNumber(1)) },
	};
}

test("engineKind accepts antigravity", () => {
	expect(engineKind("antigravity")).toEqual({
		kind: "ok",
		value: "antigravity",
	});
});

test("parseEngineSecretWrite accepts antigravity oauth token", () => {
	const key = parseEngineSecretWrite({
		engine: "antigravity",
		raw: sampleOauth,
	});
	expect(key.kind).toBe("ok");
	expect(
		parseEngineSecretWrite({
			engine: "antigravity",
			raw: "AIzaSy-test-key",
		}).kind,
	).toBe("invalid");
});

test("engineConfigFromPlaintext builds antigravity config", () => {
	const anti = antigravityConfig(true);
	expect(anti.kind).toBe("antigravity");
	expect(anti).not.toHaveProperty("fast");
});

test("install binary is agy", () => {
	expect(engineBinaryName("antigravity")).toBe("agy");
});

test("antigravity does not support fast", () => {
	expect(engineSupportsFast("antigravity")).toBe(false);
});

test("antigravityOauthToken rejects empties", () => {
	expect(antigravityOauthToken("").kind).toBe("invalid");
});

test("antigravity argv includes json-schema and skip-permissions", () => {
	const argv = buildEngineArgv({
		ctx: reviewCtx("/tmp/job-home"),
		engine: antigravityConfig(false),
		prompt: "review pls",
	});
	expect(argv).toContain("--json-schema");
	expect(argv).toContain(REPORT_JSON_SCHEMA);
	expect(argv).toContain("--dangerously-skip-permissions");
	expect(argv).toContain("--output-format");
});

test("normalizeEngineStdout unwraps antigravity structured_output", () => {
	const envelope = {
		status: "SUCCESS",
		response: JSON.stringify(sampleReport),
		structured_output: sampleReport,
	};
	const normalized = normalizeEngineStdout({
		engine: "antigravity",
		stdout: JSON.stringify(envelope),
	});
	expect(JSON.parse(normalized)).toEqual(sampleReport);
	const parsed = parseCliReport({
		engine: "antigravity",
		raw: normalized,
	});
	expect(parsed.kind).toBe("ok");
});

test("normalizeEngineStdout unwraps antigravity response when structured_output absent", () => {
	const envelope = {
		status: "SUCCESS",
		response: `${JSON.stringify(sampleReport)}\n`,
	};
	const normalized = normalizeEngineStdout({
		engine: "antigravity",
		stdout: JSON.stringify(envelope),
	});
	expect(JSON.parse(normalized)).toEqual(sampleReport);
});

test("extractJsonStdout still returns a leading object for other engines", () => {
	const raw = JSON.stringify(sampleReport);
	expect(extractJsonStdout(`thinking...\n${raw}\n`)).toBe(raw);
});

test("antigravity writes the oauth token file and forces file storage", async () => {
	const home = await createJobHome();
	try {
		const { env } = await materializeCredentials({
			ctx: reviewCtx(home.root),
			engine: antigravityConfig(false),
			home,
		});
		expect(env["GEMINI_FORCE_FILE_STORAGE"]).toBe("true");
		expect(env["GEMINI_API_KEY"]).toBeUndefined();
		const dir = path.join(home.root, ".gemini", "antigravity-cli");
		const [community, jetski] = await Promise.all([
			Bun.file(path.join(dir, "antigravity-oauth-token")).text(),
			Bun.file(path.join(dir, "jetski-standalone-oauth-token")).text(),
		]);
		expect(community).toBe(sampleOauth);
		expect(jetski).toBe(sampleOauth);
	} finally {
		await destroyJobHome(home);
	}
});
