import { errorMessage } from "@hakasebot/core/error-message.ts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import {
	bootstrapHomeRepoFn,
	refreshHomeInstallationFn,
} from "#/home/home-rpc.ts";
import { hostedBotInstallLinkFn } from "#/lab/hosted-bot.ts";
import { m as msg } from "#/paraglide/messages.js";
import { pushHomeVaultSecretsFromBrowser } from "#/web-app/repo-install.ts";
import { webAppSnapshotFn } from "#/web-app/snapshot-rpc.ts";
import { GithubRepoLink } from "#/web-app/views/github-repo-link.tsx";

type HomeInfo = NonNullable<
	Awaited<ReturnType<typeof webAppSnapshotFn>>["home"]
>;

interface HomeAction {
	busy: boolean;
	run: () => void;
}

function useHomeAction(args: {
	fallbackError: string;
	mutationFn: () => Promise<unknown>;
	onDone: () => Promise<unknown>;
	setError: (message: string | undefined) => void;
}): HomeAction {
	const mutation = useMutation({
		mutationFn: args.mutationFn,
		onError: (caught: unknown) => {
			args.setError(errorMessage(caught, args.fallbackError));
		},
		onSuccess: async () => {
			args.setError(undefined);
			await args.onDone();
		},
	});
	return {
		busy: mutation.isPending,
		run: () => {
			mutation.mutate();
		},
	};
}

async function pushHomeSecrets(githubUserId: string | undefined) {
	if (githubUserId === undefined) {
		throw new Error(msg.lab_not_loaded());
	}
	const synced = await pushHomeVaultSecretsFromBrowser({ githubUserId });
	if (synced.kind === "invalid") {
		throw new Error(synced.message);
	}
}

function HouseHelperActions(props: {
	botHref: string | undefined;
	refresh: HomeAction;
}): ReactNode {
	const runRefresh = props.refresh.run;
	return (
		<div className="grid gap-2">
			{props.botHref === undefined ? undefined : (
				<a
					className="text-accent-strong underline"
					href={props.botHref}
					rel="noreferrer"
					target="_blank"
				>
					{msg.house_let_in()}
				</a>
			)}
			<Button
				variant="ghost"
				isDisabled={props.refresh.busy}
				onPress={runRefresh}
			>
				{props.refresh.busy ? msg.import_checking() : msg.house_helper_check()}
			</Button>
		</div>
	);
}

function HomeRepoStatus(props: {
	botHref: string | undefined;
	home: HomeInfo;
	refresh: HomeAction;
	syncSecrets: HomeAction;
}): ReactNode {
	const runSync = props.syncSecrets.run;
	const helper = props.home.installationReady
		? msg.repos_status_helper_ok()
		: msg.house_helper_missing();
	const key =
		props.home.secretsSyncedAt === undefined
			? msg.repos_status_key_out()
			: msg.repos_status_key_ok();
	return (
		<div className="mt-3 grid gap-2">
			<p className="text-ink m-0 text-sm">
				<GithubRepoLink repo={props.home.repo} /> · {helper} · {key}
			</p>
			{props.home.installationReady ? undefined : (
				<HouseHelperActions botHref={props.botHref} refresh={props.refresh} />
			)}
			<Button
				variant="ghost"
				isDisabled={props.syncSecrets.busy}
				onPress={runSync}
			>
				{props.syncSecrets.busy ? msg.house_copying() : msg.house_copy_key()}
			</Button>
		</div>
	);
}

function useHomeActions(args: {
	githubUserId: string | undefined;
	onDone: () => Promise<unknown>;
	setError: (message: string | undefined) => void;
}) {
	const { githubUserId, onDone, setError } = args;
	return {
		bootstrap: useHomeAction({
			fallbackError: msg.house_make_failed(),
			mutationFn: async () => bootstrapHomeRepoFn(),
			onDone,
			setError,
		}),
		refresh: useHomeAction({
			fallbackError: msg.house_check_failed(),
			mutationFn: async () => refreshHomeInstallationFn(),
			onDone,
			setError,
		}),
		syncSecrets: useHomeAction({
			fallbackError: msg.house_copy_failed(),
			mutationFn: async () => pushHomeSecrets(githubUserId),
			onDone,
			setError,
		}),
	};
}

function useHomeRepoBlock(githubUserId: string | undefined) {
	const snapshotQuery = useQuery({
		queryFn: async () => webAppSnapshotFn(),
		queryKey: ["web-app", "snapshot"],
		staleTime: 30_000,
	});
	const botLinkQuery = useQuery({
		queryFn: async () => hostedBotInstallLinkFn(),
		queryKey: ["hosted-bot", "install-link"],
		staleTime: 60_000,
	});
	const [error, setError] = useState<string | undefined>(undefined);
	const actions = useHomeActions({
		githubUserId,
		onDone: async () => snapshotQuery.refetch(),
		setError,
	});
	return {
		...actions,
		botHref:
			botLinkQuery.data?.kind === "configured"
				? botLinkQuery.data.url
				: undefined,
		error,
		home: snapshotQuery.data?.home,
	};
}

export function HomeRepoBlock(props: {
	githubUserId: string | undefined;
}): ReactNode {
	const { bootstrap, botHref, error, home, refresh, syncSecrets } =
		useHomeRepoBlock(props.githubUserId);
	const runBootstrap = bootstrap.run;

	return (
		<div className="border-ink mt-6 border-2 px-4 py-4">
			<h3 className="text-ink m-0 text-lg font-bold">{msg.house_heading()}</h3>
			<p className="text-ink/75 m-0 mt-2 max-w-[48ch] text-sm">
				{msg.house_intro()}
			</p>
			{home === undefined ? (
				<div className="mt-4">
					<Button isDisabled={bootstrap.busy} onPress={runBootstrap}>
						{bootstrap.busy ? msg.house_making() : msg.house_make()}
					</Button>
				</div>
			) : (
				<HomeRepoStatus
					botHref={botHref}
					home={home}
					refresh={refresh}
					syncSecrets={syncSecrets}
				/>
			)}
			{error === undefined ? undefined : (
				<div className="mt-3">
					<ErrorMessage>{error}</ErrorMessage>
				</div>
			)}
		</div>
	);
}
