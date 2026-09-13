import { githubLogin } from "#/domain.ts";
import type { GithubLogin, ParseResult } from "#/domain.ts";

export const AUTO_AUTHOR_SCOPES = ["you", "friends", "everyone"] as const;
export type AutoAuthorScope = (typeof AUTO_AUTHOR_SCOPES)[number];

const AUTO_AUTHOR_SCOPE_ALIASES: Record<string, AutoAuthorScope> = {
	anyone: "you",
	outsiders: "everyone",
	team: "friends",
};

export const FRIENDS_AUTHOR_ASSOCIATIONS = [
	"OWNER",
	"MEMBER",
	"COLLABORATOR",
] as const;
export const AUTHOR_ASSOCIATIONS = [
	...FRIENDS_AUTHOR_ASSOCIATIONS,
	"CONTRIBUTOR",
	"FIRST_TIME_CONTRIBUTOR",
	"FIRST_TIMER",
	"NONE",
	"MANNEQUIN",
] as const;
export type AuthorAssociation = (typeof AUTHOR_ASSOCIATIONS)[number];

export interface AutoAuthors {
	scope: AutoAuthorScope;
	skipLogins: readonly GithubLogin[];
}

export interface PullAuthor {
	association: AuthorAssociation;
	login: GithubLogin;
	userId: string | undefined;
}

export interface AutoAuthorsCheck {
	author: PullAuthor | undefined;
	autoAuthors: AutoAuthors;
	userGithubUserId: string | undefined;
}

const FRIENDS_ASSOCIATION_SET = new Set<string>(FRIENDS_AUTHOR_ASSOCIATIONS);

export function defaultAutoAuthors(): AutoAuthors {
	return { scope: "you", skipLogins: [] };
}

export function parseAutoAuthorScope(
	value: unknown,
): ParseResult<AutoAuthorScope> {
	if (value === undefined || value === null || value === "") {
		return { kind: "ok", value: "you" };
	}
	if (typeof value !== "string") {
		return { kind: "invalid", message: "auto authors is invalid" };
	}
	for (const scope of AUTO_AUTHOR_SCOPES) {
		if (scope === value) {
			return { kind: "ok", value: scope };
		}
	}
	const aliased = AUTO_AUTHOR_SCOPE_ALIASES[value];
	if (aliased !== undefined) {
		return { kind: "ok", value: aliased };
	}
	return { kind: "invalid", message: "auto authors is invalid" };
}

export function parseSkipLogins(
	value: unknown,
): ParseResult<readonly GithubLogin[]> {
	if (value === undefined || value === null) {
		return { kind: "ok", value: [] };
	}
	if (
		!Array.isArray(value) ||
		!value.every((item) => typeof item === "string")
	) {
		return { kind: "invalid", message: "skip logins are invalid" };
	}
	const logins: GithubLogin[] = [];
	const seen = new Set<string>();
	for (const raw of value) {
		const parsed = githubLogin(raw);
		if (parsed.kind === "invalid") {
			return parsed;
		}
		if (seen.has(parsed.value)) {
			continue;
		}
		seen.add(parsed.value);
		logins.push(parsed.value);
	}
	return { kind: "ok", value: logins };
}

export function parseSkipLoginsColumn(
	value: unknown,
): ParseResult<readonly GithubLogin[]> {
	if (value === undefined || value === null || value === "") {
		return { kind: "ok", value: [] };
	}
	if (typeof value !== "string") {
		return { kind: "invalid", message: "skip logins are invalid" };
	}
	try {
		return parseSkipLogins(JSON.parse(value) as unknown);
	} catch {
		return { kind: "invalid", message: "skip logins are invalid" };
	}
}

export function parseAutoAuthors(args: {
	scope: unknown;
	skipLogins: unknown;
}): ParseResult<AutoAuthors> {
	const scope = parseAutoAuthorScope(args.scope);
	if (scope.kind === "invalid") {
		return scope;
	}
	const skipLogins = parseSkipLogins(args.skipLogins);
	if (skipLogins.kind === "invalid") {
		return skipLogins;
	}
	return {
		kind: "ok",
		value: { scope: scope.value, skipLogins: skipLogins.value },
	};
}

export function parseAutoAuthorsFromRow(args: {
	scope: unknown;
	skipLogins: unknown;
}): ParseResult<AutoAuthors> {
	const skipLogins = parseSkipLoginsColumn(args.skipLogins);
	if (skipLogins.kind === "invalid") {
		return skipLogins;
	}
	return parseAutoAuthors({
		scope: args.scope,
		skipLogins: skipLogins.value,
	});
}

export function parseAuthorAssociation(value: unknown): AuthorAssociation {
	if (typeof value !== "string") {
		return "NONE";
	}
	for (const association of AUTHOR_ASSOCIATIONS) {
		if (association === value) {
			return association;
		}
	}
	return "NONE";
}

export function autoWakeAllowsAuthor(args: AutoAuthorsCheck): boolean {
	if (
		args.author !== undefined &&
		args.autoAuthors.skipLogins.includes(args.author.login)
	) {
		return false;
	}
	if (args.author === undefined) {
		return false;
	}
	if (args.autoAuthors.scope === "everyone") {
		return true;
	}
	if (args.autoAuthors.scope === "you") {
		return (
			args.author.userId !== undefined &&
			args.userGithubUserId !== undefined &&
			args.author.userId === args.userGithubUserId
		);
	}
	return FRIENDS_ASSOCIATION_SET.has(args.author.association);
}
