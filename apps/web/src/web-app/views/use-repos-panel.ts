import { parseRepoRef } from "@hakasebot/core/domain.ts";
import type { RepoRef, RepoRefParts } from "@hakasebot/core/domain.ts";
import { errorMessage } from "@hakasebot/core/error-message.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { HostedBotInstallLink } from "#/deployment-config.ts";
import { hostedBotInstallLinkFn, resolveLabRepoFn } from "#/lab/hosted-bot.ts";
import { listLabReposFn } from "#/lab/list-lab-repos.ts";
import { m as msg } from "#/paraglide/messages.js";
import type { InstallStep, WebAppSearch } from "#/web-app/domain.ts";
import {
	enableRepoFn,
	listEnabledReposFn,
	listLastWakesFn,
	readVaultEpochFn,
} from "#/web-app/repos-rpc.ts";
import { listModelSlotsFn } from "#/web-app/slots-rpc.ts";
import { webAppSnapshotFn } from "#/web-app/snapshot-rpc.ts";
import { useRepoInstall } from "#/web-app/use-repo-install.ts";
import { useWebAppSearch } from "#/web-app/use-web-app-search.ts";

export function typedRepoFallback(args: {
	query: string;
	repos: readonly RepoRef[];
}): RepoRefParts | undefined {
	const parsed = parseRepoRef(args.query.trim());
	if (parsed.kind === "invalid") {
		return undefined;
	}
	const listed = args.repos.some(
		(repo) =>
			repo.owner.toLowerCase() === parsed.value.owner.toLowerCase() &&
			repo.name.toLowerCase() === parsed.value.name.toLowerCase(),
	);
	if (listed) {
		return undefined;
	}
	return parsed.value;
}

export function useReposPanelData() {
	const queryClient = useQueryClient();
	const snapshotQuery = useQuery({
		queryFn: async () => webAppSnapshotFn(),
		queryKey: ["web-app", "snapshot"],
		staleTime: 30_000,
	});
	const githubUserId = snapshotQuery.data?.githubUserId;
	const enabledQuery = useQuery({
		enabled: githubUserId !== undefined,
		queryFn: async () => listEnabledReposFn(),
		queryKey: ["web-app", "enabled-repos", githubUserId],
	});
	const lastWakesQuery = useQuery({
		enabled: githubUserId !== undefined,
		queryFn: async () => listLastWakesFn(),
		queryKey: ["home", "last-wakes", githubUserId],
	});
	const globalSlotsQuery = useQuery({
		enabled: githubUserId !== undefined,
		queryFn: async () => listModelSlotsFn(),
		queryKey: ["vault", githubUserId, "model-slots"],
	});
	const epochQuery = useQuery({
		enabled: githubUserId !== undefined,
		queryFn: async () => readVaultEpochFn(),
		queryKey: ["vault", githubUserId, "epoch"],
	});

	return {
		allSlots: globalSlotsQuery.data ?? [],
		enabledPending: enabledQuery.isPending,
		enabledRepos: enabledQuery.data ?? [],
		githubUserId,
		hasSyncedRepo: snapshotQuery.data?.hasSyncedRepo ?? false,
		invalidateRepos: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["web-app", "enabled-repos"],
			});
			await queryClient.invalidateQueries({
				queryKey: ["web-app", "snapshot"],
			});
		},
		lastWakes: lastWakesQuery.data,
		vaultEpoch: epochQuery.data?.epoch ?? 1,
	};
}

async function fetchLabRepos(): Promise<{
	error: string | undefined;
	repos: RepoRef[];
}> {
	try {
		return { error: undefined, repos: await listLabReposFn() };
	} catch (error: unknown) {
		return { error: errorMessage(error, msg.repos_list_failed()), repos: [] };
	}
}

export function useRepoPicker() {
	const [repos, setRepos] = useState<RepoRef[] | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);
	const [query, setQuery] = useState("");

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			const result = await fetchLabRepos();
			if (!cancelled) {
				setError(result.error);
				setRepos(result.repos);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	return {
		error,
		query,
		refresh: () => {
			void (async () => {
				const result = await fetchLabRepos();
				setError(result.error);
				setRepos(result.repos);
			})();
		},
		repos,
		setQuery,
	};
}

export function useBotLink() {
	const [botLink, setBotLink] = useState<HostedBotInstallLink | undefined>(
		undefined,
	);
	const [linkError, setLinkError] = useState<string | undefined>(undefined);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const value = await hostedBotInstallLinkFn();
				if (!cancelled) {
					setBotLink(value);
				}
			} catch (error: unknown) {
				if (!cancelled) {
					setLinkError(errorMessage(error, msg.repos_bot_link_failed()));
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	return { botLink, error: linkError };
}

export type ReposPanelData = ReturnType<typeof useReposPanelData>;

export function useRepoNav(hasSyncedRepo: boolean) {
	const { setReposSearch } = useWebAppSearch({ hasSyncedRepo });
	return {
		goDefaults: () => {
			setReposSearch({ install: undefined, repo: undefined, view: "defaults" });
		},
		goList: () => {
			setReposSearch({ install: undefined, repo: undefined, view: undefined });
		},
		openInstall: (repo: RepoRef, step: InstallStep) => {
			setReposSearch({
				install: step,
				repo: { name: repo.name, owner: repo.owner },
				view: undefined,
			});
		},
		openRepo: (repo: RepoRefParts) => {
			setReposSearch({
				install: undefined,
				repo: { name: repo.name, owner: repo.owner },
				view: undefined,
			});
		},
		setReposSearch,
	};
}

export interface EnableRepoAction {
	enabling: boolean;
	error: string | undefined;
	run: (repo: RepoRef) => void;
	runTyped: (parts: RepoRefParts) => void;
}

export function useEnableRepo(args: {
	beginInstall: (repo: RepoRef) => void;
	invalidateRepos: () => Promise<void>;
	setReposSearch: (
		next: Pick<WebAppSearch, "repo" | "install" | "view">,
	) => void;
}): EnableRepoAction {
	const mutation = useMutation({
		mutationFn: async (input: RepoRef | RepoRefParts) => {
			const repo =
				"id" in input
					? input
					: await resolveLabRepoFn({
							data: { name: input.name, owner: input.owner },
						});
			await enableRepoFn({
				data: {
					repo: {
						id: repo.id,
						name: repo.name,
						owner: repo.owner,
					},
				},
			});
			return repo;
		},
		onSuccess: async (repo) => {
			await args.invalidateRepos();
			args.setReposSearch({
				install: "bot",
				repo: { name: repo.name, owner: repo.owner },
				view: undefined,
			});
			args.beginInstall(repo);
		},
	});

	return {
		enabling: mutation.isPending,
		error: mutation.isError
			? errorMessage(mutation.error, msg.repos_enable_failed())
			: undefined,
		run: (repo: RepoRef) => {
			mutation.mutate(repo);
		},
		runTyped: (parts: RepoRefParts) => {
			mutation.mutate(parts);
		},
	};
}

export function useRepoActions(args: {
	data: ReposPanelData;
	nav: ReturnType<typeof useRepoNav>;
}) {
	const install = useRepoInstall({
		enabledRepos: args.data.enabledRepos,
		githubUserId: args.data.githubUserId,
		onFinished: () => {
			void args.data.invalidateRepos();
		},
		onStageChange: args.nav.openInstall,
	});
	const enable = useEnableRepo({
		beginInstall: install.beginInstall,
		invalidateRepos: args.data.invalidateRepos,
		setReposSearch: args.nav.setReposSearch,
	});
	return { enable, install };
}
