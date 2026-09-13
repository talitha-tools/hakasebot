import type { GithubUserToken, RepoRef } from "@hakasebot/core/domain.ts";
import { parseRepoRef, repoRefFromParts } from "@hakasebot/core/domain.ts";

import { githubUserTokenFromAccessToken } from "#/lib/github-user-token";

export const DEV_USER_DEFAULT_NAME = "hakase-dev";
export const DEV_USER_DEFAULT_USER_ID = "1";
export const DEV_USER_STUB_REPO = "hakase-dev/lab-demo";
export const DEV_USER_STUB_REPO_ID = "800001";

const stubParts = parseRepoRef(DEV_USER_STUB_REPO);
if (stubParts.kind === "invalid") {
	throw new Error(stubParts.message);
}
const stubRepo = repoRefFromParts({
	id: DEV_USER_STUB_REPO_ID,
	parts: stubParts.value,
});
if (stubRepo.kind === "invalid") {
	throw new Error(stubRepo.message);
}

export const DEV_USER_STUB_REPOS: readonly RepoRef[] = [stubRepo.value];

export type DevUserGithub =
	| { kind: "none" }
	| { kind: "token"; token: GithubUserToken };

export interface DevUserOn {
	github: DevUserGithub;
	githubUserId: string;
	githubUserIdSource: "configured" | "default";
	kind: "on";
	name: string;
}

export type DevUser = { kind: "off" } | DevUserOn;

export type DevUserPublic = { kind: "off" } | { kind: "on"; name: string };

export function isLoopbackHostname(hostname: string): boolean {
	const host = hostname.trim().toLowerCase();
	return host === "localhost" || host === "127.0.0.1";
}

function loopbackUrl(value: string | undefined): boolean {
	if (value === undefined) {
		return false;
	}
	const trimmed = value.trim();
	if (trimmed === "") {
		return false;
	}
	try {
		const url = new URL(trimmed);
		return isLoopbackHostname(url.hostname);
	} catch {
		return false;
	}
}

function trimmedOrUndefined(value: string | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed === "" ? undefined : trimmed;
}

/**
 * Localhost-only fake User. Flag must be the string `1` and the
 * request URL host must be loopback. The public Lab origin (`VITE_LAB_URL`)
 * is not part of this gate: wrangler vars may point it at production while
 * `vite dev` is still loopback (ADR-0038).
 */
export function parseDevUser(args: {
	enabled: string | undefined;
	githubUserId?: string | undefined;
	name?: string | undefined;
	requestUrl?: string | undefined;
	token?: string | undefined;
}): DevUser {
	if (args.enabled !== "1" || !loopbackUrl(args.requestUrl)) {
		return { kind: "off" };
	}

	const configuredUserId = trimmedOrUndefined(args.githubUserId);
	const githubUserId = configuredUserId ?? DEV_USER_DEFAULT_USER_ID;
	const name = trimmedOrUndefined(args.name) ?? DEV_USER_DEFAULT_NAME;
	const token = githubUserTokenFromAccessToken({
		accessToken: trimmedOrUndefined(args.token),
	});

	return {
		github: token === undefined ? { kind: "none" } : { kind: "token", token },
		githubUserId,
		githubUserIdSource:
			configuredUserId === undefined ? "default" : "configured",
		kind: "on",
		name,
	};
}

export function publicDevUser(dev: DevUser): DevUserPublic {
	if (dev.kind === "off") {
		return { kind: "off" };
	}
	return { kind: "on", name: dev.name };
}

export type DevUserGithubUserId =
	| { githubUserId: string; kind: "known" }
	| { kind: "fetch" };

/**
 * Skip GitHub `/user` when there is no PAT, or when the id was set in env.
 * A PAT with the default id must fetch so D1 matches the token owner.
 */
export function githubUserIdFromDevUser(user: DevUserOn): DevUserGithubUserId {
	if (user.github.kind === "none" || user.githubUserIdSource === "configured") {
		return { githubUserId: user.githubUserId, kind: "known" };
	}
	return { kind: "fetch" };
}
