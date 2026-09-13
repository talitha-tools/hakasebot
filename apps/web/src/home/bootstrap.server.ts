import type {
	GithubUserToken,
	ParseResult,
	RepoRef,
} from "@hakasebot/core/domain.ts";
import { mentionTrigger, parseRepoRef } from "@hakasebot/core/domain.ts";
import {
	createUserRepo,
	ensurePublicRuntimeRepo,
	fetchGithubLogin,
	fetchRepoContents,
	fetchRepoDefaultBranch,
	fetchRepoInstallation,
	githubFetch,
	putRepoContents,
} from "@hakasebot/core/github-api.server.ts";
import { githubRepoRefSchema } from "@hakasebot/core/github-api/json.ts";
import { HOME_DISPATCHER_PATH } from "@hakasebot/core/home/prefs.ts";

import type { DeploymentConfig } from "#/deployment-config.ts";
import { deploymentConfig } from "#/env.ts";
import { ensureHomeAppCoverage } from "#/home/app-coverage.server.ts";
import { printHomeDispatcherYaml } from "#/home/dispatcher-yaml.ts";
import { homeRepoName } from "#/home/name.ts";
import { createHomeStore, d1FromWorkerEnv } from "#/home/store.ts";
import type { HomeRepoRow, HomeStore } from "#/home/store.ts";
import { writeHostedBotSecrets } from "#/hosted-bot-install.server.ts";
import { m as msg } from "#/paraglide/messages.js";

async function upsertDispatcher(args: {
	config: DeploymentConfig;
	repo: RepoRef;
	token: GithubUserToken;
}): Promise<ParseResult<void>> {
	const yaml = printHomeDispatcherYaml({
		actionRef: args.config.actionRef,
		labUrl: args.config.lab.url,
		trigger:
			args.config.hostedBotApp.kind === "configured"
				? mentionTrigger(args.config.hostedBotApp.slug)
				: undefined,
	});
	const branch = await fetchRepoDefaultBranch({
		repo: args.repo,
		token: args.token,
	});
	if (branch.kind === "invalid") {
		return branch;
	}
	const existing = await fetchRepoContents({
		path: HOME_DISPATCHER_PATH,
		ref: branch.value,
		repo: args.repo,
		token: args.token,
	});
	if (existing.kind === "invalid") {
		return existing;
	}
	if (existing.kind === "ok" && existing.text === yaml) {
		return { kind: "ok", value: undefined };
	}
	const put = await putRepoContents({
		branch: branch.value,
		content: yaml,
		message:
			existing.kind === "ok"
				? "Update home dispatcher workflow"
				: "Add home dispatcher workflow",
		path: HOME_DISPATCHER_PATH,
		repo: args.repo,
		token: args.token,
		...(existing.kind === "ok" ? { sha: existing.sha } : {}),
	});
	if (put.kind === "invalid") {
		return put;
	}
	return { kind: "ok", value: undefined };
}

async function findExistingHomeRepo(args: {
	name: string;
	token: GithubUserToken;
}): Promise<RepoRef | undefined> {
	const login = await fetchGithubLogin({ token: args.token });
	if (login.kind === "invalid") {
		return undefined;
	}
	const existing = parseRepoRef(`${login.value}/${args.name}`);
	if (existing.kind === "invalid") {
		return undefined;
	}
	const repoResponse = await githubFetch({
		token: args.token,
		path: `/repos/${existing.value.owner}/${existing.value.name}`,
	});
	if (repoResponse.kind === "error") {
		return undefined;
	}
	const repo = githubRepoRefSchema.safeParse(repoResponse.json);
	return repo.success ? repo.data : undefined;
}

async function ensureHomeRepo(args: {
	name: string;
	token: GithubUserToken;
}): Promise<ParseResult<RepoRef>> {
	const created = await createUserRepo({
		name: args.name,
		token: args.token,
	});
	const repo =
		created.kind === "ok" ? created.value : await findExistingHomeRepo(args);
	if (repo === undefined) {
		return created;
	}
	if (created.kind !== "ok") {
		const branch = await fetchRepoDefaultBranch({ repo, token: args.token });
		if (branch.kind === "invalid") {
			return created;
		}
	}
	const configured = await ensurePublicRuntimeRepo({
		repo,
		token: args.token,
	});
	if (configured.kind === "invalid") {
		return configured;
	}
	return { kind: "ok", value: repo };
}

async function resolveHostedInstallation(args: {
	config: DeploymentConfig;
	repo: RepoRef;
	token: GithubUserToken;
}): Promise<ParseResult<HomeRepoRow["installationId"]>> {
	if (args.config.hostedBotApp.kind !== "configured") {
		return { kind: "ok", value: undefined };
	}
	const installationId = await ensureHomeAppCoverage({
		hostedBotApp: args.config.hostedBotApp,
		repo: args.repo,
		token: args.token,
	});
	if (installationId.kind === "invalid") {
		return installationId;
	}
	return { kind: "ok", value: installationId.value };
}

async function writeDispatcherAndSecrets(args: {
	config: DeploymentConfig;
	repo: RepoRef;
	token: GithubUserToken;
}): Promise<ParseResult<void>> {
	const dispatcher = await upsertDispatcher({
		config: args.config,
		repo: args.repo,
		token: args.token,
	});
	if (dispatcher.kind === "invalid") {
		return dispatcher;
	}
	if (args.config.hostedBotApp.kind !== "configured") {
		return { kind: "ok", value: undefined };
	}
	return writeHostedBotSecrets({
		hostedBotApp: args.config.hostedBotApp,
		repo: args.repo,
		token: args.token,
	});
}

export async function bootstrapHomeRepo(args: {
	config?: DeploymentConfig;
	githubUserId: string;
	token: GithubUserToken;
}): Promise<ParseResult<HomeRepoRow>> {
	const config = args.config ?? deploymentConfig();
	const name = homeRepoName(
		config.hostedBotApp.kind === "configured"
			? config.hostedBotApp.slug
			: undefined,
	);
	const repo = await ensureHomeRepo({ name, token: args.token });
	if (repo.kind === "invalid") {
		return repo;
	}
	const installationId = await resolveHostedInstallation({
		config,
		repo: repo.value,
		token: args.token,
	});
	if (installationId.kind === "invalid") {
		return installationId;
	}
	const dispatcherAndSecrets = await writeDispatcherAndSecrets({
		config,
		repo: repo.value,
		token: args.token,
	});
	if (dispatcherAndSecrets.kind === "invalid") {
		return dispatcherAndSecrets;
	}
	const db = await d1FromWorkerEnv();
	if (db === undefined) {
		return { kind: "invalid", message: msg.store_unbound() };
	}
	return createHomeStore(db).putHomeRepo({
		githubUserId: args.githubUserId,
		installationId: installationId.value,
		now: Date.now(),
		repo: repo.value,
	});
}

async function requireHomeRepo(
	store: HomeStore,
	githubUserId: string,
): Promise<ParseResult<HomeRepoRow>> {
	const home = await store.getHomeRepo(githubUserId);
	if (home.kind === "invalid") {
		return home;
	}
	if (home.value === undefined) {
		return { kind: "invalid", message: msg.home_repo_missing() };
	}
	return { kind: "ok", value: home.value };
}

export async function refreshHomeInstallation(args: {
	githubUserId: string;
	token: GithubUserToken;
}): Promise<ParseResult<HomeRepoRow>> {
	const db = await d1FromWorkerEnv();
	if (db === undefined) {
		return { kind: "invalid", message: msg.store_unbound() };
	}
	const store = createHomeStore(db);
	const home = await requireHomeRepo(store, args.githubUserId);
	if (home.kind === "invalid") {
		return home;
	}
	const configured = await ensurePublicRuntimeRepo({
		repo: home.value.repo,
		token: args.token,
	});
	if (configured.kind === "invalid") {
		return configured;
	}
	const config = deploymentConfig();
	if (config.hostedBotApp.kind !== "configured") {
		return { kind: "invalid", message: msg.hosted_bot_unset() };
	}
	const installation = await fetchRepoInstallation({
		appId: config.hostedBotApp.clientId,
		privateKey: config.hostedBotApp.privateKey,
		repo: home.value.repo,
	});
	if (installation.kind === "invalid") {
		return installation;
	}
	const secrets = await writeHostedBotSecrets({
		hostedBotApp: config.hostedBotApp,
		repo: home.value.repo,
		token: args.token,
	});
	if (secrets.kind === "invalid") {
		return secrets;
	}
	return store.putHomeRepo({
		githubUserId: args.githubUserId,
		installationId: installation.value,
		now: Date.now(),
		repo: home.value.repo,
	});
}
