import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import {
	getRepoSettingDefaults,
	parseSetRepoAutoAuthorsInput,
	parseSetRepoAutoBranchesInput,
	parseSetRepoAutoReviewCadenceInput,
	parseSetRepoReviewInstructionsInput,
	parseSetRepoSettingDefaultsInput,
	parseSetRepoWakeModeInput,
	readVaultEpochForUser,
	setRepoAutoAuthors,
	setRepoAutoBranches,
	setRepoAutoReviewCadence,
	setRepoReviewInstructions,
	setRepoSettingDefaults,
	setRepoWakeMode,
} from "./repos.server.ts";

export const setRepoWakeModeFn = createServerFn({ method: "POST" })
	.validator((input: { repo: string; wakeMode: string }) => {
		const parsed = parseSetRepoWakeModeInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return parsed.value;
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const updated = await setRepoWakeMode({
			cookieHeader,
			repoId: data.repoId,
			wakeMode: data.wakeMode,
		});
		if (updated.kind === "invalid") {
			throw new Error(updated.message);
		}
		return updated.value;
	});

export const setRepoAutoAuthorsFn = createServerFn({ method: "POST" })
	.validator(
		(input: { repo: string; scope: string; skipLogins?: string[] }) => {
			const parsed = parseSetRepoAutoAuthorsInput(input);
			if (parsed.kind === "invalid") {
				throw new Error(parsed.message);
			}
			return parsed.value;
		},
	)
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const updated = await setRepoAutoAuthors({
			autoAuthors: data.autoAuthors,
			cookieHeader,
			repoId: data.repoId,
		});
		if (updated.kind === "invalid") {
			throw new Error(updated.message);
		}
		return updated.value;
	});

export const setRepoAutoBranchesFn = createServerFn({ method: "POST" })
	.validator(
		(input: {
			repo: string;
			scope: string;
			branches?: string[];
			skipBranches?: string[];
		}) => {
			const parsed = parseSetRepoAutoBranchesInput(input);
			if (parsed.kind === "invalid") {
				throw new Error(parsed.message);
			}
			return parsed.value;
		},
	)
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const updated = await setRepoAutoBranches({
			autoBranches: data.autoBranches,
			cookieHeader,
			repoId: data.repoId,
		});
		if (updated.kind === "invalid") {
			throw new Error(updated.message);
		}
		return updated.value;
	});

export const setRepoAutoReviewCadenceFn = createServerFn({ method: "POST" })
	.validator((input: { repo: string; autoReviewCadence: string }) => {
		const parsed = parseSetRepoAutoReviewCadenceInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return parsed.value;
	})
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const updated = await setRepoAutoReviewCadence({
			autoReviewCadence: data.autoReviewCadence,
			cookieHeader,
			repoId: data.repoId,
		});
		if (updated.kind === "invalid") {
			throw new Error(updated.message);
		}
		return updated.value;
	});

export const setRepoReviewInstructionsFn = createServerFn({ method: "POST" })
	.validator(
		(input: { repo: string; prompt?: string; ignorePaths?: string[] }) => {
			const parsed = parseSetRepoReviewInstructionsInput(input);
			if (parsed.kind === "invalid") {
				throw new Error(parsed.message);
			}
			return parsed.value;
		},
	)
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const saved = await setRepoReviewInstructions({
			cookieHeader,
			repoId: data.repoId,
			...(data.prompt === undefined ? {} : { prompt: data.prompt }),
			...(data.ignorePaths === undefined
				? {}
				: { ignorePaths: data.ignorePaths }),
		});
		if (saved.kind === "invalid") {
			throw new Error(saved.message);
		}
		return saved.value;
	});

export const readVaultEpochFn = createServerFn({ method: "POST" }).handler(
	async () => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const epoch = await readVaultEpochForUser({ cookieHeader });
		if (epoch.kind === "invalid") {
			throw new Error(epoch.message);
		}
		return { epoch: epoch.value };
	},
);

export const getRepoSettingDefaultsFn = createServerFn({
	method: "POST",
}).handler(async () => {
	const cookieHeader = getRequestHeader("cookie") ?? "";
	const defaults = await getRepoSettingDefaults({ cookieHeader });
	if (defaults.kind === "invalid") {
		throw new Error(defaults.message);
	}
	return defaults.value;
});

export const setRepoSettingDefaultsFn = createServerFn({ method: "POST" })
	.validator(
		(input: {
			autoAuthorScope: string;
			autoBranchScope: string;
			autoReviewCadence: string;
			wakeMode: string;
		}) => {
			const parsed = parseSetRepoSettingDefaultsInput(input);
			if (parsed.kind === "invalid") {
				throw new Error(parsed.message);
			}
			return parsed.value;
		},
	)
	.handler(async ({ data }) => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const updated = await setRepoSettingDefaults({
			cookieHeader,
			defaults: data,
		});
		if (updated.kind === "invalid") {
			throw new Error(updated.message);
		}
		return updated.value;
	});
