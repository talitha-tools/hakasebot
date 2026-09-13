import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import {
	bootstrapHomeRepo,
	refreshHomeInstallation,
} from "#/home/bootstrap.server.ts";
import { createHomeStore, d1FromWorkerEnv } from "#/home/store.ts";
import { m as msg } from "#/paraglide/messages.js";
import { userGithubUserId } from "#/web-app/accounts.server.ts";
import { fetchUserGithubToken } from "#/web-app/repos.server.ts";

export const bootstrapHomeRepoFn = createServerFn({ method: "POST" }).handler(
	async () => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const githubUserId = await userGithubUserId({ cookieHeader });
		if (githubUserId.kind === "invalid") {
			throw new Error(githubUserId.message);
		}
		const token = await fetchUserGithubToken({ cookieHeader });
		if (token.kind === "invalid") {
			throw new Error(token.message);
		}
		const bootstrapped = await bootstrapHomeRepo({
			githubUserId: githubUserId.value,
			token: token.value,
		});
		if (bootstrapped.kind === "invalid") {
			throw new Error(bootstrapped.message);
		}
		return bootstrapped.value;
	},
);

export const refreshHomeInstallationFn = createServerFn({
	method: "POST",
}).handler(async () => {
	const cookieHeader = getRequestHeader("cookie") ?? "";
	const githubUserId = await userGithubUserId({ cookieHeader });
	if (githubUserId.kind === "invalid") {
		throw new Error(githubUserId.message);
	}
	const token = await fetchUserGithubToken({ cookieHeader });
	if (token.kind === "invalid") {
		throw new Error(token.message);
	}
	const refreshed = await refreshHomeInstallation({
		githubUserId: githubUserId.value,
		token: token.value,
	});
	if (refreshed.kind === "invalid") {
		throw new Error(refreshed.message);
	}
	return refreshed.value;
});

export const readHomeRepoFn = createServerFn({ method: "POST" }).handler(
	async () => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const githubUserId = await userGithubUserId({ cookieHeader });
		if (githubUserId.kind === "invalid") {
			throw new Error(githubUserId.message);
		}
		const db = await d1FromWorkerEnv();
		if (db === undefined) {
			return;
		}
		const home = await createHomeStore(db).getHomeRepo(githubUserId.value);
		if (home.kind === "invalid") {
			throw new Error(home.message);
		}
		return home.value;
	},
);

export const markHomeSyncedFn = createServerFn({ method: "POST" })
	.validator((input: { epoch: number }) => input)
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const githubUserId = await userGithubUserId({ cookieHeader });
		if (githubUserId.kind === "invalid") {
			throw new Error(githubUserId.message);
		}
		const db = await d1FromWorkerEnv();
		if (db === undefined) {
			throw new Error(msg.store_unbound());
		}
		const marked = await createHomeStore(db).markHomeSecretsSynced({
			epoch: data.epoch,
			githubUserId: githubUserId.value,
		});
		if (marked.kind === "invalid") {
			throw new Error(marked.message);
		}
		return marked.value;
	});
