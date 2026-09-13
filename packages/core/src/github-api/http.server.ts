import { z } from "zod";

import type { GithubToken, GithubUserToken } from "#/domain.ts";

const GITHUB_API = "https://api.github.com";

const githubErrorSchema = z.object({
	message: z.string(),
});

function githubPathError(
	path: string,
): { kind: "error"; status: number; message: string } | undefined {
	if (!path.startsWith("/") || path.includes("/../") || path.includes("/..")) {
		return {
			kind: "error",
			message: "github path is invalid",
			status: 400,
		};
	}
	return undefined;
}

export async function githubFetch(args: {
	token: GithubToken | GithubUserToken;
	path: string;
	method?: string;
	body?: unknown;
}): Promise<
	| { kind: "ok"; status: number; json: unknown }
	| { kind: "error"; status: number; message: string }
> {
	const pathError = githubPathError(args.path);
	if (pathError !== undefined) {
		return pathError;
	}
	const response = await fetch(`${GITHUB_API}${args.path}`, {
		method: args.method ?? "GET",
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${args.token}`,
			"User-Agent": "hakasebot",
			"X-GitHub-Api-Version": "2022-11-28",
			...(args.body === undefined
				? {}
				: { "Content-Type": "application/json" }),
		},
		...(args.body === undefined ? {} : { body: JSON.stringify(args.body) }),
	});
	const text = await response.text();
	let json: unknown = {};
	if (text.length > 0) {
		try {
			json = JSON.parse(text) as unknown;
		} catch {
			json = { message: text };
		}
	}
	if (!response.ok) {
		const error = githubErrorSchema.safeParse(json);
		return {
			kind: "error",
			message: error.success
				? error.data.message
				: `GitHub API ${String(response.status)}`,
			status: response.status,
		};
	}
	return { kind: "ok", status: response.status, json };
}
