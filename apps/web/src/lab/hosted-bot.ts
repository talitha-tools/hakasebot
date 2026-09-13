import { parseRepoRef, repoRef } from "@hakasebot/core/domain.ts";
import type { RepoRef } from "@hakasebot/core/domain.ts";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { hostedBotInstallLink } from "#/deployment-config.ts";
import { deploymentConfig } from "#/env.ts";
import { resolveNamedRepoForSession } from "#/github-repos.server.ts";

import { completeHostedBotInstall } from "./hosted-bot.server.ts";

export function parseCompleteHostedBotInstallInput(input: {
	repo: { id: string; owner: string; name: string };
}): { repo: RepoRef } {
	const parsed = repoRef(input.repo);
	if (parsed.kind === "invalid") {
		throw new Error(parsed.message);
	}
	return { repo: parsed.value };
}

export const hostedBotInstallLinkFn = createServerFn({
	method: "GET",
}).handler(() => hostedBotInstallLink(deploymentConfig().hostedBotApp));

export const completeHostedBotInstallFn = createServerFn({
	method: "POST",
})
	.validator((input: { repo: { id: string; owner: string; name: string } }) =>
		parseCompleteHostedBotInstallInput(input),
	)
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		return completeHostedBotInstall({
			cookieHeader,
			repo: data.repo,
		});
	});

export const resolveLabRepoFn = createServerFn({ method: "POST" })
	.validator((input: { owner: string; name: string }) => {
		const parsed = parseRepoRef(`${input.owner}/${input.name}`);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return parsed.value;
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const resolved = await resolveNamedRepoForSession({
			cookieHeader,
			parts: data,
		});
		if (resolved.kind === "invalid") {
			throw new Error(resolved.message);
		}
		return resolved.value;
	});
