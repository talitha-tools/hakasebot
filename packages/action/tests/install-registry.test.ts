import { expect, test } from "vitest";

import type { RunShell } from "#/install-registry.ts";
import {
	engineBinaryName,
	engineBinaryOverride,
	installChildEnv,
	prepareEngines,
} from "#/install-registry.ts";

test("engineBinaryOverride prefers global bin over per-engine bin", () => {
	expect(
		engineBinaryOverride("claude", {
			HAKASEBOT_CLAUDE_BIN: "/tmp/claude",
			HAKASEBOT_ENGINE_BIN: "/tmp/all",
		}),
	).toBe("/tmp/all");
});

test("engineBinaryName maps cursor to agent", () => {
	expect(engineBinaryName("cursor")).toBe("agent");
});

test("prepareEngines skips network install when global engine override is set", async () => {
	let installCalls = 0;
	const runShell: RunShell = () => {
		installCalls += 1;
		return { exitCode: 0, stderr: "" };
	};
	const prepared = await prepareEngines({
		deps: {
			commandAvailable: () => false,
			runShell,
		},
		env: { HAKASEBOT_ENGINE_BIN: "/tmp/fake-engine" },
		engines: ["claude", "cursor"],
	});
	expect(prepared).toEqual({ kind: "ok", installed: [] });
	expect(installCalls).toBe(0);
});

test("prepareEngines installs only missing engines and updates PATH", async () => {
	const installedScripts: string[] = [];
	const available = new Set<string>();
	const runShell: RunShell = (script) => {
		installedScripts.push(script);
		if (script.includes("claude.ai/install.sh")) {
			available.add("claude");
		}
		return { exitCode: 0, stderr: "" };
	};
	const env: NodeJS.ProcessEnv = { PATH: "/usr/bin:/bin" };
	const prepared = await prepareEngines({
		deps: {
			commandAvailable: (binary) => available.has(binary),
			runShell,
		},
		env,
		engines: ["claude"],
	});
	expect(prepared).toEqual({ kind: "ok", installed: ["claude"] });
	expect(installedScripts).toHaveLength(1);
	expect(installedScripts[0]).toContain("claude.ai/install.sh");
	expect(env["PATH"]).toContain(".local/bin");
});

test("prepareEngines falls back to npm when native claude install fails", async () => {
	const installedScripts: string[] = [];
	const available = new Set<string>();
	const runShell: RunShell = (script) => {
		installedScripts.push(script);
		if (script.includes("@anthropic-ai/claude-code")) {
			available.add("claude");
			return { exitCode: 0, stderr: "" };
		}
		return { exitCode: 22, stderr: "403" };
	};
	const prepared = await prepareEngines({
		deps: {
			commandAvailable: (binary) => available.has(binary),
			runShell,
		},
		env: { PATH: "/usr/bin:/bin" },
		engines: ["claude"],
	});
	expect(prepared).toEqual({ kind: "ok", installed: ["claude"] });
	expect(installedScripts).toHaveLength(2);
});

test("prepareEngines is idempotent when binaries are already available", async () => {
	let installCalls = 0;
	const prepared = await prepareEngines({
		deps: {
			commandAvailable: () => true,
			runShell: () => {
				installCalls += 1;
				return { exitCode: 0, stderr: "" };
			},
		},
		env: {},
		engines: ["grok"],
	});
	expect(prepared).toEqual({ kind: "ok", installed: [] });
	expect(installCalls).toBe(0);
});

test("prepareEngines skips network install when per-engine bin override is set", async () => {
	let installCalls = 0;
	const prepared = await prepareEngines({
		deps: {
			commandAvailable: () => false,
			runShell: () => {
				installCalls += 1;
				return { exitCode: 0, stderr: "" };
			},
		},
		env: { HAKASEBOT_CLAUDE_BIN: "/tmp/claude" },
		engines: ["claude"],
	});
	expect(prepared).toEqual({ kind: "ok", installed: [] });
	expect(installCalls).toBe(0);
});

test("prepareEngines installs each unique engine from a multi-engine queue", async () => {
	const installed: string[] = [];
	const available = new Set<string>(["codex"]);
	const prepared = await prepareEngines({
		deps: {
			commandAvailable: (binary) => available.has(binary),
			runShell: (script) => {
				installed.push(script);
				if (script.includes("claude.ai/install.sh")) {
					available.add("claude");
				}
				if (script.includes("x.ai/cli/install.sh")) {
					available.add("grok");
				}
				return { exitCode: 0, stderr: "" };
			},
		},
		env: { PATH: "/usr/bin:/bin" },
		engines: ["claude", "codex", "grok"],
	});
	expect(prepared).toEqual({ kind: "ok", installed: ["claude", "grok"] });
	expect(installed).toHaveLength(2);
});

test("installChildEnv keeps PATH, HOME, locale, proxy, and npm cache", () => {
	const env = installChildEnv({
		GITHUB_TOKEN: "ghs_parent",
		HOME: "/real/home",
		HTTPS_PROXY: "http://proxy.example:8080",
		INPUT_ENCRYPTION_KEY: "encryption-key",
		INPUT_GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----",
		LANG: "C.UTF-8",
		PATH: "/usr/bin:/bin",
		npm_config_cache: "/tmp/npm-cache",
	});
	expect(env["PATH"]).toBe("/usr/bin:/bin");
	expect(env["HOME"]).toBe("/real/home");
	expect(env["LANG"]).toBe("C.UTF-8");
	expect(env["HTTPS_PROXY"]).toBe("http://proxy.example:8080");
	expect(env["npm_config_cache"]).toBe("/tmp/npm-cache");
	expect(env["GITHUB_TOKEN"]).toBeUndefined();
	expect(env["INPUT_ENCRYPTION_KEY"]).toBeUndefined();
	expect(env["INPUT_GITHUB_APP_PRIVATE_KEY"]).toBeUndefined();
});
