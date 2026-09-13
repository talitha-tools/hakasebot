import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { isRecord } from "@hakasebot/core/is-record.ts";
import { expect, test } from "vitest";

const repoRoot = path.join(import.meta.dirname, "../../..");
const DEP_FIELDS = ["dependencies", "devDependencies"] as const;

function readJsonObject(filePath: string): Record<string, unknown> {
	const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
	if (!isRecord(parsed)) {
		throw new Error(`${filePath} is not an object`);
	}
	return parsed;
}

function readStringArray(value: unknown): string[] | undefined {
	if (
		!Array.isArray(value) ||
		!value.every((entry) => typeof entry === "string")
	) {
		return undefined;
	}
	return value;
}

function workspacesObject(
	rootPkg: Record<string, unknown>,
): Record<string, unknown> {
	const { workspaces } = rootPkg;
	if (!isRecord(workspaces)) {
		throw new Error("root workspaces is not an object");
	}
	return workspaces;
}

function workspacePackageGlobs(rootPkg: Record<string, unknown>): string[] {
	const globs = readStringArray(workspacesObject(rootPkg)["packages"]);
	if (globs === undefined) {
		throw new Error("root workspaces.packages is missing");
	}
	return globs;
}

function catalogVersions(
	rootPkg: Record<string, unknown>,
): Record<string, string> {
	const raw = workspacesObject(rootPkg)["catalog"];
	if (!isRecord(raw)) {
		throw new Error("root workspaces.catalog is missing");
	}
	const catalog: Record<string, string> = {};
	for (const [name, version] of Object.entries(raw)) {
		if (typeof version !== "string" || version.length === 0) {
			throw new Error(`catalog ${name} is not a version string`);
		}
		catalog[name] = version;
	}
	return catalog;
}

function manifestPaths(root: string, globs: readonly string[]): string[] {
	const files = [path.join(root, "package.json")];
	for (const pattern of globs) {
		const match = /^(?<stem>[^/*]+)\/\*$/u.exec(pattern);
		const stem = match?.groups?.["stem"];
		if (stem === undefined) {
			throw new Error(`unsupported workspace glob ${pattern}`);
		}
		const dir = path.join(root, stem);
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (!entry.isDirectory()) {
				continue;
			}
			const filePath = path.join(dir, entry.name, "package.json");
			if (existsSync(filePath)) {
				files.push(filePath);
			}
		}
	}
	return files;
}

function declaredDependencies(
	pkg: Record<string, unknown>,
): ReadonlyMap<string, string> {
	const declared = new Map<string, string>();
	for (const field of DEP_FIELDS) {
		const block = pkg[field];
		if (block === undefined) {
			continue;
		}
		if (!isRecord(block)) {
			throw new Error(`${field} is not an object`);
		}
		for (const [name, version] of Object.entries(block)) {
			if (typeof version !== "string") {
				throw new TypeError(`${name} version is not a string`);
			}
			declared.set(name, version);
		}
	}
	return declared;
}

test("shared workspace dependencies use catalog: or workspace:*", () => {
	const rootPkg = readJsonObject(path.join(repoRoot, "package.json"));
	const catalog = catalogVersions(rootPkg);
	const byName = new Map<string, { refs: string[]; versions: Set<string> }>();

	for (const filePath of manifestPaths(
		repoRoot,
		workspacePackageGlobs(rootPkg),
	)) {
		const relative = path.relative(repoRoot, filePath);
		for (const [name, version] of declaredDependencies(
			readJsonObject(filePath),
		)) {
			const seen = byName.get(name) ?? {
				refs: [],
				versions: new Set<string>(),
			};
			seen.refs.push(`${relative} ${version}`);
			seen.versions.add(version);
			byName.set(name, seen);
		}
	}

	const drift: string[] = [];
	const usedCatalog = new Set<string>();
	for (const [name, seen] of byName) {
		if (seen.refs.length < 2) {
			continue;
		}
		if (name.startsWith("@hakasebot/")) {
			if (![...seen.versions].every((version) => version === "workspace:*")) {
				drift.push(`${name}: ${seen.refs.join("; ")}`);
			}
			continue;
		}
		if (![...seen.versions].every((version) => version === "catalog:")) {
			drift.push(`${name}: ${seen.refs.join("; ")}`);
			continue;
		}
		if (!Object.hasOwn(catalog, name)) {
			drift.push(`${name}: catalog: with no workspaces.catalog entry`);
			continue;
		}
		usedCatalog.add(name);
	}

	const unusedCatalog = Object.keys(catalog).filter(
		(name) => !usedCatalog.has(name),
	);
	expect(drift).toEqual([]);
	expect(unusedCatalog).toEqual([]);
});
