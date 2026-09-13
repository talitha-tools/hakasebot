import type { GithubInstallationId, RepoRef } from "@hakasebot/core/domain.ts";

import { deploymentConfig } from "#/env.ts";
import { hostedBotSecretWriteForRepo } from "#/hosted-bot-install.server.ts";
import { readUserSession } from "#/lib/user-session";
import { m as msg } from "#/paraglide/messages.js";

export async function completeHostedBotInstall(args: {
	cookieHeader: string;
	repo: RepoRef;
}): Promise<{ installationId: GithubInstallationId; kind: "ok" }> {
	const session = await readUserSession({
		cookieHeader: args.cookieHeader,
	});
	if (session.kind === "missing") {
		throw new Error(msg.session_expired());
	}
	if (session.kind === "error") {
		throw new Error(session.message);
	}
	const config = deploymentConfig();
	const appWrite = await hostedBotSecretWriteForRepo({
		hostedBotApp: config.hostedBotApp,
		repo: args.repo,
	});
	if (appWrite.kind === "invalid") {
		throw new Error(appWrite.message);
	}
	return {
		installationId: appWrite.value.installationId,
		kind: "ok",
	};
}
