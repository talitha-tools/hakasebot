import path from "node:path";

import {
	commentId,
	commitSha,
	effort,
	modelName,
	pullNumber,
} from "@hakasebot/core/domain.ts";
import type { EngineKind } from "@hakasebot/core/domain.ts";
import { isRecord } from "@hakasebot/core/is-record.ts";
import { consumerNotesFilename } from "@hakasebot/core/review.server.ts";
import {
	FAKE_ENGINE_BIN,
	FAKE_SKILLS_BIN,
	FAKE_SKILLS_FAIL_BIN,
	must,
} from "@hakasebot/test-kit/helpers/job.ts";
import { afterEach, expect, test } from "vitest";

import { engineScriptPath } from "#/engine-scripts.ts";
import {
	buildEngineArgv,
	buildReviewPrompt,
	claudeAllowedTools,
	claudeSettingsJson,
	codexConfigToml,
	engineChildEnv,
	extractJsonStdout,
	looksLikeAuthFailure,
	redactEngineFailureDetail,
	runEnginePass,
	SKILLS_BIN_ENV,
	skillsInstallArgv,
	specReviewGuidance,
	standardsReviewGuidance,
} from "#/engines.ts";
import { engineConfigFromPlaintext } from "#/home/engine-config.ts";

const JOB_HOME = "/tmp/job-home";
const REVIEW_PLAN = {
	kind: "review" as const,
	pullNumber: must(pullNumber(1)),
};
const MENTION_PLAN = {
	commentId: must(commentId(9)),
	kind: "mention" as const,
	pullNumber: must(pullNumber(1)),
};

function reviewArgv(
	engine: ReturnType<typeof engineFromPlaintext>,
	prompt = "review pls",
) {
	return buildEngineArgv({
		ctx: { homeDir: JOB_HOME, plan: REVIEW_PLAN },
		engine,
		prompt,
	});
}

function engineFromPlaintext(args: {
	effort: string;
	fast: boolean;
	kind: EngineKind;
	model: string;
	plaintext: string;
}) {
	const parsedEffort = must(effort(args.effort));
	const parsedModel = must(modelName(args.model));
	return must(
		engineConfigFromPlaintext({
			effort: parsedEffort,
			fast: args.fast,
			kind: args.kind,
			model: parsedModel,
			plaintext: args.plaintext,
		}),
	);
}

const previousBin = process.env["HAKASEBOT_ENGINE_BIN"];
const previousSkillsBin = process.env[SKILLS_BIN_ENV];
const previousMode = process.env["HAKASEBOT_FAKE_ENGINE_MODE"];
const previousWorkspace = process.env["GITHUB_WORKSPACE"];

afterEach(() => {
	if (previousBin === undefined) {
		delete process.env["HAKASEBOT_ENGINE_BIN"];
	} else {
		process.env["HAKASEBOT_ENGINE_BIN"] = previousBin;
	}
	if (previousSkillsBin === undefined) {
		delete process.env["HAKASEBOT_SKILLS_BIN"];
	} else {
		process.env[SKILLS_BIN_ENV] = previousSkillsBin;
	}
	if (previousMode === undefined) {
		delete process.env["HAKASEBOT_FAKE_ENGINE_MODE"];
	} else {
		process.env["HAKASEBOT_FAKE_ENGINE_MODE"] = previousMode;
	}
	if (previousWorkspace === undefined) {
		delete process.env["GITHUB_WORKSPACE"];
	} else {
		process.env["GITHUB_WORKSPACE"] = previousWorkspace;
	}
});

test("looksLikeAuthFailure is false on exit 0", () => {
	expect(
		looksLikeAuthFailure({
			engine: "codex",
			exitCode: 0,
			stderr: "unauthorized",
			stdout: "",
		}),
	).toBe(false);
});

test("looksLikeAuthFailure matches unauthorized and expired text", () => {
	expect(
		looksLikeAuthFailure({
			engine: "codex",
			exitCode: 1,
			stderr: "Error: unauthorized",
			stdout: "",
		}),
	).toBe(true);
	expect(
		looksLikeAuthFailure({
			engine: "grok",
			exitCode: 2,
			stderr: "",
			stdout: "token expired, please login",
		}),
	).toBe(true);
	expect(
		looksLikeAuthFailure({
			engine: "codex",
			exitCode: 1,
			stderr: "401 Invalid token",
			stdout: "",
		}),
	).toBe(true);
});

test("looksLikeAuthFailure ignores unrelated non-zero exits", () => {
	expect(
		looksLikeAuthFailure({
			engine: "codex",
			exitCode: 1,
			stderr: "model overloaded",
			stdout: "",
		}),
	).toBe(false);
});

test("extractJsonStdout returns raw object stdout unchanged", () => {
	const raw = '{"summary":"ok","findings":[]}';
	expect(extractJsonStdout(raw)).toBe(raw);
});

test("extractJsonStdout strips leading chatter around a JSON object", () => {
	const raw = '{"summary":"ok","findings":[]}';
	expect(extractJsonStdout(`thinking...\n${raw}\n`)).toBe(raw);
});

test("extractJsonStdout keeps non-JSON stdout when no object is present", () => {
	expect(extractJsonStdout("not json at all")).toBe("not json at all");
});

test("claude argv keeps effort and never emits --fast", () => {
	const engine = engineFromPlaintext({
		effort: "high",
		fast: true,
		kind: "claude",
		model: "opus",
		plaintext: "oauth-token",
	});
	expect(engine.kind).toBe("claude");
	if (engine.kind !== "claude") {
		return;
	}
	expect(engine.fast).toBe(true);
	const argv = reviewArgv(engine);
	expect(argv).toContain("--effort");
	expect(argv).toContain("high");
	expect(argv).not.toContain("--fast");
	expect(argv).toContain("--permission-mode");
	expect(argv).toContain("dontAsk");
	const allowedIndex = argv.indexOf("--allowedTools");
	expect(allowedIndex).toBeGreaterThan(-1);
	expect(argv[allowedIndex + 1]).toContain(
		`Bash(${engineScriptPath(JOB_HOME, "review-merge-base")}:*)`,
	);
	expect(argv).not.toContain("--dangerously-skip-permissions");
});

test("codex argv inserts --fast before -- when fast", () => {
	const engine = engineFromPlaintext({
		effort: "medium",
		fast: true,
		kind: "codex",
		model: "gpt-5",
		plaintext: '{"token":"codex-auth"}',
	});
	expect(engine.kind).toBe("codex");
	const argv = reviewArgv(engine);
	expect(argv).toEqual([
		"exec",
		"--sandbox",
		"workspace-write",
		"--ask-for-approval",
		"never",
		"--add-dir",
		JOB_HOME,
		"--model",
		"gpt-5",
		"--fast",
		"--",
		"review pls",
	]);
});

test("codex argv omits --fast when not fast", () => {
	const engine = engineFromPlaintext({
		effort: "medium",
		fast: false,
		kind: "codex",
		model: "gpt-5",
		plaintext: '{"token":"codex-auth"}',
	});
	const argv = reviewArgv(engine);
	expect(argv).toEqual([
		"exec",
		"--sandbox",
		"workspace-write",
		"--ask-for-approval",
		"never",
		"--add-dir",
		JOB_HOME,
		"--model",
		"gpt-5",
		"--",
		"review pls",
	]);
});

test("cursor keeps fast on EngineConfig and does not emit --fast", () => {
	const engine = engineFromPlaintext({
		effort: "medium",
		fast: true,
		kind: "cursor",
		model: "composer",
		plaintext: "cursor-login",
	});
	expect(engine.kind).toBe("cursor");
	if (engine.kind !== "cursor") {
		return;
	}
	expect(engine.fast).toBe(true);
	const argv = reviewArgv(engine);
	expect(argv).not.toContain("--fast");
	expect(argv).toContain("--sandbox");
	expect(argv).toContain("enabled");
	expect(argv).toContain("--trust");
	expect(argv).not.toContain("--force");
	expect(argv).not.toContain("--yolo");
});

test("engineConfigFromPlaintext ignores fast on grok", () => {
	const engine = engineFromPlaintext({
		effort: "medium",
		fast: true,
		kind: "grok",
		model: "grok-4",
		plaintext: '{"token":"grok-auth"}',
	});
	expect(engine.kind).toBe("grok");
	expect(engine).not.toHaveProperty("fast");
});

test("mention plans allow workspace writes on claude and cursor", () => {
	const claude = engineFromPlaintext({
		effort: "medium",
		fast: false,
		kind: "claude",
		model: "opus",
		plaintext: "oauth-token",
	});
	expect(claudeAllowedTools({ homeDir: JOB_HOME, plan: MENTION_PLAN })).toEqual(
		expect.arrayContaining(["Edit", "Write"]),
	);
	expect(
		claudeAllowedTools({ homeDir: JOB_HOME, plan: REVIEW_PLAN }),
	).not.toContain("Edit");
	const cursorArgv = buildEngineArgv({
		ctx: { homeDir: JOB_HOME, plan: MENTION_PLAN },
		engine: engineFromPlaintext({
			effort: "medium",
			fast: false,
			kind: "cursor",
			model: "composer",
			plaintext: "cursor-login",
		}),
		prompt: "fix it",
	});
	expect(cursorArgv).toContain("--force");
	expect(reviewArgv(claude)).not.toContain("--force");
});

test("codexConfigToml pins workspace-write and job HOME", () => {
	expect(codexConfigToml(JOB_HOME)).toContain(
		'sandbox_mode = "workspace-write"',
	);
	expect(codexConfigToml(JOB_HOME)).toContain(
		`writable_roots = ["${JOB_HOME}"]`,
	);
});

function parseClaudeSettings(raw: string): {
	fastMode: boolean | undefined;
	permissions: { allow: string[]; defaultMode: string | undefined };
} {
	const parsed: unknown = JSON.parse(raw);
	if (!isRecord(parsed)) {
		throw new Error("claude settings must be an object");
	}
	const { permissions } = parsed;
	if (!isRecord(permissions)) {
		throw new Error("claude settings must include permissions");
	}
	const { allow } = permissions;
	return {
		fastMode:
			typeof parsed["fastMode"] === "boolean" ? parsed["fastMode"] : undefined,
		permissions: {
			allow: Array.isArray(allow)
				? allow.filter((entry): entry is string => typeof entry === "string")
				: [],
			defaultMode:
				typeof permissions["defaultMode"] === "string"
					? permissions["defaultMode"]
					: undefined,
		},
	};
}

test("claudeSettingsJson always writes dontAsk allowlist", () => {
	const fast = parseClaudeSettings(
		claudeSettingsJson({
			fast: true,
			homeDir: JOB_HOME,
			plan: REVIEW_PLAN,
		}),
	);
	expect(fast.fastMode).toBe(true);
	expect(fast.permissions.defaultMode).toBe("dontAsk");
	expect(fast.permissions.allow).toContain(
		`Bash(${engineScriptPath(JOB_HOME, "review-merge-base")}:*)`,
	);
	expect(fast.permissions.allow).toContain(
		`Write(${path.join(JOB_HOME, "review-report.json")})`,
	);
	expect(fast.permissions.allow).not.toContain("Edit");

	const slow = parseClaudeSettings(
		claudeSettingsJson({
			fast: false,
			homeDir: JOB_HOME,
			plan: REVIEW_PLAN,
		}),
	);
	expect(slow.fastMode).toBeUndefined();
	expect(slow.permissions.defaultMode).toBe("dontAsk");
});

test("review prompt orders dashboard, ignore, and consumer instructions before schema", () => {
	const prompt = buildReviewPrompt({
		homeDir: JOB_HOME,
		reportPath: "/tmp/review-report.json",
		axis: "standards",
		instructions: {
			consumerNotes: "Consumer note: generated code is checked in.",
			ignorePaths: ["CHANGELOG.md", "docs/generated/**"],
			prompt: "Focus on correctness, not wording.",
		},
		plan: { kind: "review", pullNumber: must(pullNumber(4)) },
	});
	const guidanceAt = prompt.indexOf(
		"Follow the installed code-review skill for the Standards axis only.",
	);
	const dashboardAt = prompt.indexOf("Focus on correctness, not wording.");
	const ignoresAt = prompt.indexOf("Ignore these paths:");
	const consumerAt = prompt.indexOf(
		"Consumer note: generated code is checked in.",
	);
	const schemaAt = prompt.indexOf(
		"The file must contain ONLY valid JSON matching this schema:",
	);
	expect(guidanceAt).toBeGreaterThan(-1);
	expect(dashboardAt).toBeGreaterThan(guidanceAt);
	expect(ignoresAt).toBeGreaterThan(dashboardAt);
	expect(prompt).toContain("- CHANGELOG.md");
	expect(prompt).toContain("- docs/generated/**");
	expect(consumerAt).toBeGreaterThan(ignoresAt);
	expect(schemaAt).toBeGreaterThan(consumerAt);
	expect(prompt).toContain(
		"The Review runtime drops findings on path ignore globs, missing or out-of-range lines, lines not in the pull diff, and no-op patches.",
	);
	expect(prompt).toContain(engineScriptPath(JOB_HOME, "review-merge-base"));
	expect(prompt).toContain(engineScriptPath(JOB_HOME, "review-diff"));
});

test("review prompt omits empty instructions and accepts missing consumer notes", () => {
	const prompt = buildReviewPrompt({
		homeDir: JOB_HOME,
		reportPath: "/tmp/review-report.json",
		axis: "spec",
		instructions: {
			ignorePaths: [],
			prompt: "   ",
		},
		plan: { kind: "review", pullNumber: must(pullNumber(4)) },
	});
	expect(prompt).not.toContain("Ignore these paths:");
	expect(prompt).not.toContain("undefined");
	expect(prompt).toContain(
		"The file must contain ONLY valid JSON matching this schema:",
	);
	expect(prompt).toContain(
		"Write summary and finding bodies in a neutral technical voice.",
	);
});

test("standards and spec prompts stay thin and on their own axis", () => {
	const standards = buildReviewPrompt({
		homeDir: JOB_HOME,
		reportPath: "/tmp/review-report.json",
		axis: "standards",
		plan: { kind: "review", pullNumber: must(pullNumber(4)) },
	});
	const spec = buildReviewPrompt({
		homeDir: JOB_HOME,
		reportPath: "/tmp/review-report.json",
		axis: "spec",
		plan: { kind: "review", pullNumber: must(pullNumber(4)) },
	});
	expect(standards).toContain(standardsReviewGuidance());
	expect(standards).toContain("installed code-review skill");
	expect(standards).not.toContain("Mysterious Name");
	expect(standards).not.toContain("Spec axis only.");
	expect(spec).toContain(specReviewGuidance());
	expect(spec).toContain("Spec axis only");
	expect(spec).toContain("docs/, specs/, or .scratch/");
	expect(spec).not.toContain("Standards axis only.");
	expect(standards).toContain('Prefer kind "patch"');
	expect(spec).toContain('"kind": "patch"');
});

test("incremental review prompt uses review-diff-since and prior body", () => {
	const sinceSha = must(commitSha("cccccccccccccccccccccccccccccccccccccccc"));
	const prompt = buildReviewPrompt({
		axis: "standards",
		homeDir: JOB_HOME,
		priorReview: {
			priorBody: "prior summary from last review",
			sinceSha,
		},
		reportPath: "/tmp/review-report.json",
		plan: { kind: "review", pullNumber: must(pullNumber(4)) },
	});
	expect(prompt).toContain("incremental diff since the prior posted review");
	expect(prompt).toContain(engineScriptPath(JOB_HOME, "review-diff-since"));
	expect(prompt).toContain(
		`- Diff: ${engineScriptPath(JOB_HOME, "review-diff-since")}`,
	);
	expect(prompt).toContain("prior summary from last review");
	expect(prompt).toContain("Do not repeat prior findings");
});

test("skillsInstallArgv uses bunx skills by default and honors override", () => {
	delete process.env["HAKASEBOT_SKILLS_BIN"];
	expect(skillsInstallArgv()).toEqual([
		"bunx",
		"skills",
		"add",
		"mattpocock/skills",
		"--skill",
		"code-review",
		"--agent",
		"*",
		"-g",
		"-y",
		"--copy",
	]);
	process.env[SKILLS_BIN_ENV] = "/tmp/fake-skills";
	expect(skillsInstallArgv()).toEqual([
		"/tmp/fake-skills",
		"add",
		"mattpocock/skills",
		"--skill",
		"code-review",
		"--agent",
		"*",
		"-g",
		"-y",
		"--copy",
	]);
});

test("review prompt requires an axis", () => {
	expect(() =>
		buildReviewPrompt({
			homeDir: JOB_HOME,
			plan: { kind: "review", pullNumber: must(pullNumber(4)) },
			reportPath: "/tmp/review-report.json",
		}),
	).toThrow(/axis/u);
});

test("mention and fix prompts skip axis guidance", () => {
	const mention = buildReviewPrompt({
		homeDir: JOB_HOME,
		reportPath: "/tmp/review-report.json",
		plan: {
			commentId: must(commentId(9)),
			kind: "mention",
			pullNumber: must(pullNumber(4)),
		},
	});
	const fix = buildReviewPrompt({
		homeDir: JOB_HOME,
		reportPath: "/tmp/review-report.json",
		plan: {
			commentId: must(commentId(9)),
			kind: "fix",
			pullNumber: must(pullNumber(4)),
		},
	});
	expect(mention).not.toContain("Standards axis only.");
	expect(mention).not.toContain("Spec axis only.");
	expect(fix).not.toContain("Standards axis only.");
	expect(fix).toContain(
		"Prefer patch findings with suggestion replacements where appropriate.",
	);
	expect(mention).toContain(
		"The Review runtime drops findings on path ignore globs, missing or out-of-range lines, lines not in the pull diff, and no-op patches.",
	);
	expect(fix).toContain(
		"The Review runtime drops findings on path ignore globs, missing or out-of-range lines, lines not in the pull diff, and no-op patches.",
	);
	expect(mention).toContain(engineScriptPath(JOB_HOME, "review-diff"));
	expect(fix).toContain(engineScriptPath(JOB_HOME, "review-merge-base"));
});

test("consumer notes filename is .hakasebot.md", () => {
	expect(consumerNotesFilename()).toBe(".hakasebot.md");
});

test("engineChildEnv keeps PATH and engine credentials, drops Action secrets", () => {
	const env = engineChildEnv({
		engineEnv: {
			CLAUDE_CODE_OAUTH_TOKEN: "sk-ant-live",
			GITHUB_TOKEN: "engine-token",
		},
		home: "/tmp/job-home",
		parent: {
			GITHUB_TOKEN: "ghs_parent",
			HAKASEBOT_MODEL_QUEUE: "[]",
			INPUT_CREDENTIAL_VAULT: "{}",
			INPUT_GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
			INPUT_ENCRYPTION_KEY: "encryption-key",
			PATH: "/usr/bin",
		},
	});
	expect(env["PATH"]).toBe(
		`${path.join("/tmp/job-home", "bin")}${path.delimiter}/usr/bin`,
	);
	expect(env["HOME"]).toBe("/tmp/job-home");
	expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBe("sk-ant-live");
	expect(env["GITHUB_TOKEN"]).toBe("engine-token");
	expect(env["HAKASEBOT_FAKE_ENGINE_MODE"]).toBeUndefined();
	expect(env["INPUT_ENCRYPTION_KEY"]).toBeUndefined();
	expect(env["INPUT_CREDENTIAL_VAULT"]).toBeUndefined();
	expect(env["INPUT_GITHUB_APP_PRIVATE_KEY"]).toBeUndefined();
	expect(env["HAKASEBOT_MODEL_QUEUE"]).toBeUndefined();
});

test("redactEngineFailureDetail strips secrets and truncates", () => {
	expect(
		redactEngineFailureDetail({
			detail: "unauthorized token=sk-ant-secret",
			secrets: ["sk-ant-secret"],
		}),
	).toBe("unauthorized token=***");
	const long = "x".repeat(400);
	expect(redactEngineFailureDetail({ detail: long, secrets: [] }).length).toBe(
		303,
	);
});

test("runEnginePass failed message does not include the engine credential", async () => {
	process.env["HAKASEBOT_ENGINE_BIN"] = FAKE_ENGINE_BIN;
	process.env[SKILLS_BIN_ENV] = FAKE_SKILLS_BIN;
	process.env["HAKASEBOT_FAKE_ENGINE_MODE"] = "echo-secret";
	process.env["GITHUB_WORKSPACE"] = process.cwd();
	const credential = "sk-ant-SHOULD-NOT-LEAK";
	const result = await runEnginePass({
		axis: "standards",
		engine: engineFromPlaintext({
			effort: "medium",
			fast: false,
			kind: "claude",
			model: "opus",
			plaintext: credential,
		}),
		plan: { kind: "review", pullNumber: must(pullNumber(1)) },
	});
	expect(result.kind).toBe("failed");
	if (result.kind !== "failed") {
		return;
	}
	expect(result.message).toContain("engine exited 2");
	expect(result.message).not.toContain(credential);
	expect(result.message).toContain("token=***");
});

test("runEnginePass fails when the report file is missing and stdout is not a report", async () => {
	process.env["HAKASEBOT_ENGINE_BIN"] = FAKE_ENGINE_BIN;
	process.env[SKILLS_BIN_ENV] = FAKE_SKILLS_BIN;
	process.env["HAKASEBOT_FAKE_ENGINE_MODE"] = "ok-no-report";
	process.env["GITHUB_WORKSPACE"] = process.cwd();
	const result = await runEnginePass({
		axis: "standards",
		engine: engineFromPlaintext({
			effort: "medium",
			fast: false,
			kind: "claude",
			model: "opus",
			plaintext: "oauth-token",
		}),
		plan: { kind: "review", pullNumber: must(pullNumber(1)) },
	});
	expect(result.kind).toBe("failed");
	if (result.kind !== "failed") {
		return;
	}
	expect(result.message).toContain("report file missing");
});

test("runEnginePass falls back to stdout when the report file is missing", async () => {
	process.env["HAKASEBOT_ENGINE_BIN"] = FAKE_ENGINE_BIN;
	process.env[SKILLS_BIN_ENV] = FAKE_SKILLS_BIN;
	process.env["HAKASEBOT_FAKE_ENGINE_MODE"] = "ok-stdout-only";
	process.env["GITHUB_WORKSPACE"] = process.cwd();
	const result = await runEnginePass({
		axis: "standards",
		engine: engineFromPlaintext({
			effort: "medium",
			fast: false,
			kind: "claude",
			model: "opus",
			plaintext: "oauth-token",
		}),
		plan: { kind: "review", pullNumber: must(pullNumber(1)) },
	});
	expect(result.kind).toBe("ok");
	if (result.kind !== "ok") {
		return;
	}
	expect(result.report.summary).toBe("from stdout");
	expect(result.report.findings).toEqual([]);
});

test("runEnginePass fails when skills install exits non-zero", async () => {
	process.env["HAKASEBOT_ENGINE_BIN"] = FAKE_ENGINE_BIN;
	process.env[SKILLS_BIN_ENV] = FAKE_SKILLS_FAIL_BIN;
	process.env["GITHUB_WORKSPACE"] = process.cwd();
	const result = await runEnginePass({
		axis: "standards",
		engine: engineFromPlaintext({
			effort: "medium",
			fast: false,
			kind: "claude",
			model: "opus",
			plaintext: "oauth-token",
		}),
		plan: { kind: "review", pullNumber: must(pullNumber(1)) },
	});
	expect(result.kind).toBe("failed");
	if (result.kind !== "failed") {
		return;
	}
	expect(result.message).toContain("skills install exited");
});
