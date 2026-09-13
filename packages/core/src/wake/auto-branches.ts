import type { ParseResult } from "#/domain.ts";

export const AUTO_BRANCH_SCOPES = ["all", "default", "listed"] as const;
export type AutoBranchScope = (typeof AUTO_BRANCH_SCOPES)[number];

export interface AutoBranches {
	scope: AutoBranchScope;
	branches: readonly string[];
	skipBranches: readonly string[];
}

export interface AutoBranchesCheck {
	baseRef: string | undefined;
	defaultBranch: string | undefined;
	autoBranches: AutoBranches;
}

export function defaultAutoBranches(): AutoBranches {
	return { scope: "default", branches: [], skipBranches: [] };
}

export function parseAutoBranchScope(
	value: unknown,
): ParseResult<AutoBranchScope> {
	if (value === undefined || value === null || value === "") {
		return { kind: "ok", value: "default" };
	}
	if (typeof value !== "string") {
		return { kind: "invalid", message: "auto branches is invalid" };
	}
	for (const scope of AUTO_BRANCH_SCOPES) {
		if (scope === value) {
			return { kind: "ok", value: scope };
		}
	}
	return { kind: "invalid", message: "auto branches is invalid" };
}

function parseBranchNames(value: unknown): ParseResult<readonly string[]> {
	if (value === undefined || value === null) {
		return { kind: "ok", value: [] };
	}
	if (
		!Array.isArray(value) ||
		!value.every((item) => typeof item === "string")
	) {
		return { kind: "invalid", message: "branch names are invalid" };
	}
	const branches: string[] = [];
	const seen = new Set<string>();
	for (const raw of value) {
		const trimmed = raw.trim();
		if (trimmed.length === 0) {
			continue;
		}
		if (seen.has(trimmed)) {
			continue;
		}
		seen.add(trimmed);
		branches.push(trimmed);
	}
	return { kind: "ok", value: branches };
}

export function parseBranchNamesColumn(
	value: unknown,
): ParseResult<readonly string[]> {
	if (value === undefined || value === null || value === "") {
		return { kind: "ok", value: [] };
	}
	if (typeof value !== "string") {
		return { kind: "invalid", message: "branch names are invalid" };
	}
	try {
		return parseBranchNames(JSON.parse(value) as unknown);
	} catch {
		return { kind: "invalid", message: "branch names are invalid" };
	}
}

export function parseAutoBranches(args: {
	scope: unknown;
	branches?: unknown;
	skipBranches?: unknown;
}): ParseResult<AutoBranches> {
	const scope = parseAutoBranchScope(args.scope);
	if (scope.kind === "invalid") {
		return scope;
	}
	const branches = parseBranchNames(args.branches);
	if (branches.kind === "invalid") {
		return branches;
	}
	const skipBranches = parseBranchNames(args.skipBranches);
	if (skipBranches.kind === "invalid") {
		return skipBranches;
	}
	return {
		kind: "ok",
		value: {
			scope: scope.value,
			branches: branches.value,
			skipBranches: skipBranches.value,
		},
	};
}

export function parseAutoBranchesFromRow(args: {
	scope: unknown;
	branches: unknown;
	skipBranches: unknown;
}): ParseResult<AutoBranches> {
	const branches = parseBranchNamesColumn(args.branches);
	if (branches.kind === "invalid") {
		return branches;
	}
	const skipBranches = parseBranchNamesColumn(args.skipBranches);
	if (skipBranches.kind === "invalid") {
		return skipBranches;
	}
	return parseAutoBranches({
		scope: args.scope,
		branches: branches.value,
		skipBranches: skipBranches.value,
	});
}

export function branchNameMatches(pattern: string, branch: string): boolean {
	if (!pattern.includes("*")) {
		return pattern === branch;
	}
	const escaped = pattern
		.split("*")
		.map((part) => part.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
		.join(".*");
	return new RegExp(`^${escaped}$`, "u").test(branch);
}

export function branchMatchesAny(
	patterns: readonly string[],
	branch: string,
): boolean {
	return patterns.some((pattern) => branchNameMatches(pattern, branch));
}

export function autoWakeAllowsBranch(args: AutoBranchesCheck): boolean {
	if (args.baseRef === undefined) {
		return false;
	}
	if (branchMatchesAny(args.autoBranches.skipBranches, args.baseRef)) {
		return false;
	}
	if (args.autoBranches.scope === "all") {
		return true;
	}
	if (args.autoBranches.scope === "default") {
		return (
			args.defaultBranch !== undefined && args.baseRef === args.defaultBranch
		);
	}
	return branchMatchesAny(args.autoBranches.branches, args.baseRef);
}
