import type {
	GithubInstallationId,
	GithubUserToken,
	ParseResult,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import {
	addRepoToUserInstallation,
	fetchRepoInstallation,
	fetchUserAppInstallation,
} from "@hakasebot/core/github-api.server.ts";

import type { HostedBotApp } from "#/deployment-config.ts";
import { m as msg } from "#/paraglide/messages.js";

export async function ensureHomeAppCoverage(args: {
	hostedBotApp: Extract<HostedBotApp, { kind: "configured" }>;
	repo: RepoRef;
	token: GithubUserToken;
}): Promise<ParseResult<GithubInstallationId>> {
	const existing = await fetchRepoInstallation({
		appId: args.hostedBotApp.clientId,
		privateKey: args.hostedBotApp.privateKey,
		repo: args.repo,
	});
	if (existing.kind === "ok") {
		return existing;
	}
	const userInstall = await fetchUserAppInstallation({
		accountLogin: args.repo.owner,
		appSlug: args.hostedBotApp.slug,
		token: args.token,
	});
	if (userInstall.kind !== "ok") {
		return { kind: "invalid", message: msg.house_helper_install_first() };
	}
	const added = await addRepoToUserInstallation({
		installationId: userInstall.value,
		repoId: args.repo.id,
		token: args.token,
	});
	if (added.kind === "invalid") {
		return { kind: "invalid", message: msg.house_helper_install_first() };
	}
	const covered = await fetchRepoInstallation({
		appId: args.hostedBotApp.clientId,
		privateKey: args.hostedBotApp.privateKey,
		repo: args.repo,
	});
	if (covered.kind === "invalid") {
		return { kind: "invalid", message: msg.house_helper_install_first() };
	}
	return covered;
}
