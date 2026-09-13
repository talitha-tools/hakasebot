/** Facade: repo lifecycle server fns here; settings and model-list fns re-exported. */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import {
	completeRepoBot,
	disableRepo,
	enableRepo,
	fetchUserGithubToken,
	listEnabledRepos,
	listLastWakes,
	markRepoSynced,
	parseEnableRepoInput,
	parseRepoIdInput,
} from "./repos.server.ts";

export {
	clearRepoModelListFn,
	listRepoModelSlotsFn,
	setRepoModelListFn,
} from "./repo-model-list-rpc.ts";
export {
	getRepoSettingDefaultsFn,
	readVaultEpochFn,
	setRepoAutoAuthorsFn,
	setRepoAutoBranchesFn,
	setRepoAutoReviewCadenceFn,
	setRepoReviewInstructionsFn,
	setRepoSettingDefaultsFn,
	setRepoWakeModeFn,
} from "./repo-settings-rpc.ts";

export const listEnabledReposFn = createServerFn({ method: "POST" }).handler(
	async () => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const repos = await listEnabledRepos({ cookieHeader });
		if (repos.kind === "invalid") {
			throw new Error(repos.message);
		}
		return repos.value;
	},
);

export const listLastWakesFn = createServerFn({ method: "POST" }).handler(
	async () => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const wakes = await listLastWakes({ cookieHeader });
		if (wakes.kind === "invalid") {
			throw new Error(wakes.message);
		}
		return wakes.value;
	},
);

export const enableRepoFn = createServerFn({ method: "POST" })
	.validator((input: { repo: { id: string; owner: string; name: string } }) => {
		const parsed = parseEnableRepoInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return { repo: parsed.value };
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const enabled = await enableRepo({
			cookieHeader,
			repo: data.repo,
		});
		if (enabled.kind === "invalid") {
			throw new Error(enabled.message);
		}
		return enabled.value;
	});

export const disableRepoFn = createServerFn({ method: "POST" })
	.validator((input: { repo: string }) => {
		const parsed = parseRepoIdInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return { repoId: parsed.value };
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const disabled = await disableRepo({
			cookieHeader,
			repoId: data.repoId,
		});
		if (disabled.kind === "invalid") {
			throw new Error(disabled.message);
		}
		return { ok: true as const };
	});

export const completeRepoBotFn = createServerFn({ method: "POST" })
	.validator((input: { repo: string }) => {
		const parsed = parseRepoIdInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return { repoId: parsed.value };
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const result = await completeRepoBot({
			cookieHeader,
			repoId: data.repoId,
		});
		if (result.kind === "invalid") {
			throw new Error(result.message);
		}
		return result.value;
	});

export const markRepoSyncedFn = createServerFn({ method: "POST" })
	.validator((input: { repo: string; epoch: number }) => {
		const parsed = parseRepoIdInput({ repo: input.repo });
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return { epoch: input.epoch, repoId: parsed.value };
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const synced = await markRepoSynced({
			cookieHeader,
			epoch: data.epoch,
			repoId: data.repoId,
		});
		if (synced.kind === "invalid") {
			throw new Error(synced.message);
		}
		return synced.value;
	});

export const fetchUserGithubTokenFn = createServerFn({
	method: "POST",
}).handler(async () => {
	const cookieHeader = getRequestHeader("cookie") ?? "";
	const token = await fetchUserGithubToken({ cookieHeader });
	if (token.kind === "invalid") {
		throw new Error(token.message);
	}
	return { token: token.value };
});
