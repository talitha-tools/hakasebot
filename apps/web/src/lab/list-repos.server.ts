import type { GithubUserToken, RepoRef } from "@hakasebot/core/domain.ts";
import { exhaustive } from "@hakasebot/core/domain.ts";
import { listUserAppGrantedRepos } from "@hakasebot/core/github-api.server.ts";

import type { HostedBotApp } from "#/deployment-config.ts";
import { deploymentConfig } from "#/env.ts";
import { listSessionRepos } from "#/github-repos.server.ts";
import { DEV_USER_STUB_REPOS } from "#/lib/dev-user.ts";
import type { DevUser } from "#/lib/dev-user.ts";
import type { AccessTokenFetcher } from "#/lib/github-session";
import { readUserSession } from "#/lib/user-session";
import { m as msg } from "#/paraglide/messages.js";

async function reposFromGithubToken(args: {
	hostedBotApp: HostedBotApp;
	token: GithubUserToken;
}): Promise<RepoRef[]> {
	const listed =
		args.hostedBotApp.kind === "configured"
			? await listUserAppGrantedRepos({
					appSlug: args.hostedBotApp.slug,
					token: args.token,
				})
			: await listSessionRepos({ token: args.token });
	if (listed.kind === "invalid") {
		throw new Error(listed.message);
	}
	return listed.value;
}

export async function listReposForSession(args: {
	cookieHeader: string;
	devUser?: DevUser;
	getAccessToken?: AccessTokenFetcher;
	hostedBotApp?: HostedBotApp;
}): Promise<RepoRef[]> {
	const hostedBotApp = args.hostedBotApp ?? deploymentConfig().hostedBotApp;
	const session = await readUserSession({
		cookieHeader: args.cookieHeader,
		...(args.devUser === undefined ? {} : { devUser: args.devUser }),
		...(args.getAccessToken === undefined
			? {}
			: { getAccessToken: args.getAccessToken }),
	});
	switch (session.kind) {
		case "oauth": {
			return reposFromGithubToken({ hostedBotApp, token: session.token });
		}
		case "dev": {
			if (session.user.github.kind === "token") {
				return reposFromGithubToken({
					hostedBotApp,
					token: session.user.github.token,
				});
			}
			return [...DEV_USER_STUB_REPOS];
		}
		case "missing": {
			throw new Error(msg.session_expired());
		}
		case "error": {
			throw new Error(session.message);
		}
		default: {
			return exhaustive(session);
		}
	}
}
