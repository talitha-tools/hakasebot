import type { ParseResult } from "./parse.ts";
import { brandString, parseInvalid, parseOk, requireText } from "./parse.ts";

export type CommitSha = string & { readonly __brand: "CommitSha" };
export type RepoId = string & { readonly __brand: "RepoId" };
export type RepoOwner = string & { readonly __brand: "RepoOwner" };
export type RepoName = string & { readonly __brand: "RepoName" };
export type RepoPath = string & { readonly __brand: "RepoPath" };
export type AbsolutePath = string & { readonly __brand: "AbsolutePath" };
export type GithubLogin = string & { readonly __brand: "GithubLogin" };

export interface RepoRefParts {
	owner: RepoOwner;
	name: RepoName;
}

export interface RepoRef extends RepoRefParts {
	id: RepoId;
}

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/u;
const NAME_PATTERN = /^[A-Za-z0-9._-]+$/u;
const REPO_ID_PATTERN = /^[1-9][0-9]*$/u;
const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

export function commitSha(value: string): ParseResult<CommitSha> {
	const normalized = value.toLowerCase();
	if (!SHA_PATTERN.test(normalized)) {
		return parseInvalid("commit sha must be 40 or 64 hex chars");
	}
	return parseOk(brandString(normalized, "CommitSha"));
}

export function repoId(value: string | number): ParseResult<RepoId> {
	const normalized = typeof value === "number" ? String(value) : value.trim();
	if (!REPO_ID_PATTERN.test(normalized)) {
		return parseInvalid("repository id must be a positive integer");
	}
	return parseOk(brandString(normalized, "RepoId"));
}

export function repoOwner(value: string): ParseResult<RepoOwner> {
	if (!OWNER_PATTERN.test(value)) {
		return parseInvalid("invalid repository owner");
	}
	return parseOk(brandString(value, "RepoOwner"));
}

export function repoName(value: string): ParseResult<RepoName> {
	if (
		value === "." ||
		value === ".." ||
		value.length === 0 ||
		value.length > 100 ||
		!NAME_PATTERN.test(value)
	) {
		return parseInvalid("invalid repository name");
	}
	return parseOk(brandString(value, "RepoName"));
}

export function repoPath(value: string): ParseResult<RepoPath> {
	const parsed = requireText(value, "path");
	if (parsed.kind === "invalid") {
		return parsed;
	}
	return parseOk(brandString(parsed.value, "RepoPath"));
}

export function absolutePath(value: string): ParseResult<AbsolutePath> {
	if (value.length === 0) {
		return parseInvalid("path is empty");
	}
	return parseOk(brandString(value, "AbsolutePath"));
}

export function githubLogin(value: string): ParseResult<GithubLogin> {
	const trimmed = value.trim().replace(/^@/u, "").toLowerCase();
	if (trimmed.length === 0) {
		return parseInvalid("github login is empty");
	}
	if (!/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/u.test(trimmed)) {
		return parseInvalid("github login is invalid");
	}
	return parseOk(brandString(trimmed, "GithubLogin"));
}

export function parseRepoRef(value: string): ParseResult<RepoRefParts> {
	const parts = value.split("/");
	if (parts.length !== 2) {
		return parseInvalid("repository must be owner/name");
	}
	const [ownerRaw, nameRaw] = parts;
	if (ownerRaw === undefined || nameRaw === undefined) {
		return parseInvalid("repository must be owner/name");
	}
	const owner = repoOwner(ownerRaw);
	if (owner.kind === "invalid") {
		return owner;
	}
	const name = repoName(nameRaw);
	if (name.kind === "invalid") {
		return name;
	}
	return parseOk({ owner: owner.value, name: name.value });
}

export function repoRef(args: {
	id: string | number;
	owner: string;
	name: string;
}): ParseResult<RepoRef> {
	const id = repoId(args.id);
	if (id.kind === "invalid") {
		return id;
	}
	const owner = repoOwner(args.owner);
	if (owner.kind === "invalid") {
		return owner;
	}
	const name = repoName(args.name);
	if (name.kind === "invalid") {
		return name;
	}
	return parseOk({ id: id.value, name: name.value, owner: owner.value });
}

export function repoRefFromParts(args: {
	id: string | number;
	parts: RepoRefParts;
}): ParseResult<RepoRef> {
	return repoRef({
		id: args.id,
		name: args.parts.name,
		owner: args.parts.owner,
	});
}

export function repoRefFromApi(item: {
	full_name: string;
	id: number;
}): ParseResult<RepoRef> {
	const parts = parseRepoRef(item.full_name);
	if (parts.kind === "invalid") {
		return parts;
	}
	return repoRefFromParts({ id: item.id, parts: parts.value });
}
