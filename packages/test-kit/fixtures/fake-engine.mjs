#!/usr/bin/env bun

import { writeFileSync } from "node:fs";
import process from "node:process";

const mode = process.env.HAKASEBOT_FAKE_ENGINE_MODE ?? "ok";

if (mode === "auth-fail") {
	console.error("unauthorized: login expired");
	process.exit(1);
}

if (mode === "fail") {
	console.error("engine exploded");
	process.exit(2);
}

if (mode === "echo-secret") {
	const token = process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "";
	console.error(`unauthorized token=${token}`);
	process.exit(2);
}

if (mode === "ok-no-report") {
	process.stdout.write("no report file this time");
	process.exit(0);
}

if (mode === "ok-stdout-only") {
	process.stdout.write(
		JSON.stringify({
			summary: "from stdout",
			findings: [],
		}),
	);
	process.exit(0);
}

const prompt = process.argv.slice(2).join(" ");
const standardsOnly = prompt.includes("Standards axis only");
const specOnly = prompt.includes("Spec axis only");

let report;
if (standardsOnly) {
	report = {
		summary: "standards summary",
		findings: [
			{
				kind: "note",
				path: "src/x.ts",
				start: 1,
				lineCount: 1,
				body: "Standards: looks fine here",
			},
		],
	};
} else if (specOnly) {
	report = {
		summary: "spec summary",
		findings: [
			{
				kind: "patch",
				path: "src/x.ts",
				start: 2,
				lineCount: 1,
				body: "Spec: prefer this form",
				replacement: "fixed;\n",
			},
		],
	};
} else {
	report = {
		summary: "markdown",
		findings: [
			{
				kind: "note",
				path: "src/x.ts",
				start: 1,
				lineCount: 1,
				body: "looks fine here",
			},
			{
				kind: "patch",
				path: "src/x.ts",
				start: 2,
				lineCount: 1,
				body: "prefer this form",
				replacement: "fixed;\n",
			},
		],
	};
}

const json = JSON.stringify(report);
const marker = "absolute path (create or overwrite): ";
const markerAt = prompt.indexOf(marker);
if (markerAt !== -1) {
	const after = prompt.slice(markerAt + marker.length);
	const end = after.search(/\s/u);
	const reportPath = end === -1 ? after : after.slice(0, end);
	if (reportPath.length > 0) {
		writeFileSync(reportPath, json, "utf8");
	}
}
process.stdout.write(json);
process.exit(0);
