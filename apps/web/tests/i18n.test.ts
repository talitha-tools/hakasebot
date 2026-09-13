import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { isRecord } from "@hakasebot/core/is-record.ts";
import { expect, test } from "vitest";

import { ENGINE_OPTIONS, engineLabel } from "#/lab/constants.ts";
import { m as msg } from "#/paraglide/messages.js";
import { getLocale } from "#/paraglide/runtime.js";

const webRoot = path.join(import.meta.dirname, "..");
const repoRoot = path.join(webRoot, "../..");

function* walkFiles(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const filePath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "dist") {
				continue;
			}
			yield* walkFiles(filePath);
			continue;
		}
		if (/\.(?:ts|tsx|js|mjs)$/u.test(entry.name)) {
			yield filePath;
		}
	}
}

function readJsonObject(filePath: string): Record<string, unknown> {
	const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
	if (!isRecord(parsed)) {
		throw new Error(`${filePath} is not an object`);
	}
	return parsed;
}

function i18nCompileScript(): string {
	const { scripts } = readJsonObject(path.join(webRoot, "package.json"));
	if (!isRecord(scripts)) {
		throw new Error("package.json missing scripts");
	}
	const compile = scripts["i18n:compile"];
	if (typeof compile !== "string") {
		throw new TypeError("package.json missing i18n:compile");
	}
	return compile;
}

test("english is the base locale", () => {
	expect(getLocale()).toBe("en");
	expect(
		msg.about_pr_body_1({
			poke: msg.about_pr_poke_trigger({ trigger: "@fork-bot" }),
		}),
	).toContain("@fork-bot");
	expect(msg.host_checklist_ticked({ label: "webhook URL" })).toBe(
		"[x] webhook URL",
	);
});

test("html lang comes from getLocale", () => {
	const source = readFileSync(
		path.join(webRoot, "src/components/root-document.tsx"),
		"utf8",
	);
	expect(source).toContain("lang={getLocale()}");
});

test("locale strategy is baseLocale only", () => {
	const vite = readFileSync(path.join(webRoot, "vite.config.ts"), "utf8");
	expect(vite).toContain('strategy: ["baseLocale"]');
	expect(vite).not.toContain("cookieName");
	expect(vite).not.toContain("preferredLanguage");
	const compile = i18nCompileScript();
	expect(compile).toContain("--strategy baseLocale");
	expect(compile).not.toContain("cookie");
	expect(compile).not.toContain("preferredLanguage");
});

test("server fetch wraps paraglideMiddleware", () => {
	const source = readFileSync(path.join(webRoot, "src/server.ts"), "utf8");
	expect(source).toContain("paraglideMiddleware");
});

test("engine ids stay interpolated and the catalog omits the product stem", () => {
	expect(msg.repos_heading()).toBe("let robot in!!");
	expect(msg.house_let_in()).toBe("let the helper into the house");
	expect(
		msg.about_brains_body({
			antigravity: engineLabel("antigravity"),
			engines: ENGINE_OPTIONS.map((option) => option.label).join("!! "),
		}),
	).toContain("claude!! codex!! grok!! cursor!! antigravity!!");
	expect(
		msg.lab_hero_step_secrets_body({
			keyEngine: engineLabel("cursor"),
			loginEngine: engineLabel("claude"),
		}),
	).toBe(
		"a claude login. a cursor key. whatever brain you like!! i lock them with a key only your browser knows. i don't peek. promise!!",
	);

	const catalog = readJsonObject(path.join(webRoot, "messages/en.json"));
	for (const [key, value] of Object.entries(catalog)) {
		if (key === "$schema" || typeof value !== "string") {
			continue;
		}
		expect(value, key).not.toMatch(/\bhakasebot\b/iu);
	}
	expect(catalog["about_brains_body"]).toContain("{engines}");
	expect(catalog["lab_hero_step_secrets_body"]).toContain("{loginEngine}");
	expect(catalog["credential_label_claude"]).toContain("{engine}");
	expect(catalog["credential_hint_claude"]).toContain("{engine}");
});

test("core and action never import the web catalog", () => {
	for (const pkg of ["packages/core", "packages/action"] as const) {
		for (const file of walkFiles(path.join(repoRoot, pkg))) {
			const source = readFileSync(file, "utf8");
			expect(source, file).not.toContain("#/paraglide");
			expect(source, file).not.toContain("apps/web/messages");
			expect(source, file).not.toContain("paraglide/messages");
		}
	}
});
