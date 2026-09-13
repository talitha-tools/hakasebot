#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const home = process.env.HOME;
if (home === undefined || home.length === 0) {
	console.error("HOME is required");
	process.exit(1);
}

const skillDir = path.join(home, ".agents", "skills", "code-review");
mkdirSync(skillDir, { recursive: true });
writeFileSync(
	path.join(skillDir, "SKILL.md"),
	"# code-review\n\nfake skill for tests\n",
	"utf8",
);
