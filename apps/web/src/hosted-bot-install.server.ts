import type {
	AppSecretWrite,
	GithubInstallationId,
	GithubUserToken,
	ParseResult,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import { fetchRepoInstallation } from "@hakasebot/core/github-api.server.ts";

import type { HostedBotApp } from "#/deployment-config.ts";
import { writeActionsSecrets } from "#/github-secrets.server.ts";
import { m as msg } from "#/paraglide/messages.js";

function hostedBotSecretWrite(args: {
	hostedBotApp: Extract<HostedBotApp, { kind: "configured" }>;
	installationId: GithubInstallationId;
}): AppSecretWrite {
	return {
		appId: args.hostedBotApp.clientId,
		installationId: args.installationId,
		kind: "app",
		privateKey: args.hostedBotApp.privateKey,
	};
}

async function hostedBotSecretWriteForRepo(args: {
	hostedBotApp: HostedBotApp;
	repo: RepoRef;
}): Promise<ParseResult<AppSecretWrite>> {
	if (args.hostedBotApp.kind === "unset") {
		return {
			kind: "invalid",
			message: msg.hosted_bot_app_unset(),
		};
	}
	const installation = await fetchRepoInstallation({
		appId: args.hostedBotApp.clientId,
		privateKey: args.hostedBotApp.privateKey,
		repo: args.repo,
	});
	if (installation.kind === "invalid") {
		return installation;
	}
	return {
		kind: "ok",
		value: hostedBotSecretWrite({
			hostedBotApp: args.hostedBotApp,
			installationId: installation.value,
		}),
	};
}

export async function writeHostedBotSecrets(args: {
	hostedBotApp: HostedBotApp;
	repo: RepoRef;
	token: GithubUserToken;
}): Promise<ParseResult<void>> {
	const secretWrite = await hostedBotSecretWriteForRepo({
		hostedBotApp: args.hostedBotApp,
		repo: args.repo,
	});
	if (secretWrite.kind !== "ok") {
		return secretWrite;
	}
	const written = await writeActionsSecrets({
		userToken: args.token,
		repo: args.repo,
		writes: [secretWrite.value],
	});
	if (written.kind === "invalid") {
		return written;
	}
	return { kind: "ok", value: undefined };
}

export { hostedBotSecretWrite, hostedBotSecretWriteForRepo };
