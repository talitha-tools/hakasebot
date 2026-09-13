import { errorMessage } from "@hakasebot/core/error-message.ts";
import type { ModelSlot } from "@hakasebot/core/vault/model-slot.ts";
import { useMutation } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import type { HostedBotInstallLink } from "#/deployment-config.ts";
import type { LastWake } from "#/home/store.ts";
import { m as msg } from "#/paraglide/messages.js";
import type { EnabledRepo } from "#/web-app/domain.ts";
import { formatRepoRef } from "#/web-app/domain.ts";
import { repoNeedsResync } from "#/web-app/machine.ts";
import { disableRepoFn } from "#/web-app/repos-rpc.ts";
import type { useRepoInstall } from "#/web-app/use-repo-install.ts";

import { GithubRepoLink } from "./github-repo-link.tsx";
import { LastWakeView } from "./last-wake.tsx";
import { RepoBrainsSection } from "./repo-brains.tsx";
import { RepoInstallNotes } from "./repo-install-notes.tsx";
import { RepoWakeSettingsBox } from "./repo-wake-settings.tsx";
import { ReviewInstructions } from "./review-instructions.tsx";

function repoStatusParts(row: EnabledRepo, vaultEpoch: number): string[] {
	const stale = repoNeedsResync(row, vaultEpoch);
	const parts = [
		row.botAt === undefined
			? msg.repos_status_helper_out()
			: msg.repos_status_helper_ok(),
		row.homeAt === undefined
			? msg.repos_status_house_out()
			: msg.repos_status_house_ok(),
		row.lastSyncedAt === undefined
			? msg.repos_status_key_out()
			: msg.repos_status_key_ok(),
	];
	if (stale) {
		parts.push(msg.repos_status_key_stale());
	}
	return parts;
}

export function EnabledRepoListItem(props: {
	lastWake: LastWake | undefined;
	onOpen: () => void;
	row: EnabledRepo;
	vaultEpoch: number;
}): ReactNode {
	const repoLabel = formatRepoRef(props.row.repo);
	const statusParts = repoStatusParts(props.row, props.vaultEpoch);

	return (
		<li className="border-ink border-2">
			<div className="flex w-full items-start justify-between gap-3 px-3 py-3">
				<div className="min-w-0">
					<GithubRepoLink className="font-bold" repo={props.row.repo} />
					<button
						aria-label={msg.repos_open_settings({ repo: repoLabel })}
						className="hover:bg-blush/30 text-ink mt-0 block w-full border-0 bg-transparent p-0 text-left"
						onClick={props.onOpen}
						type="button"
					>
						<p className="text-ink/60 m-0 text-sm">{statusParts.join(" · ")}</p>
						<LastWakeView lastWake={props.lastWake} />
					</button>
				</div>
				<button
					aria-hidden="true"
					className="text-ink/50 hover:bg-blush/30 shrink-0 border-0 bg-transparent p-0 text-lg"
					onClick={props.onOpen}
					tabIndex={-1}
					type="button"
				>
					→
				</button>
			</div>
		</li>
	);
}

function InstallOrResyncButton(props: {
	install: ReturnType<typeof useRepoInstall>;
	row: EnabledRepo;
}): ReactNode {
	if (props.row.lastSyncedAt === undefined) {
		return (
			<Button
				variant="ghost"
				onPress={() => {
					props.install.beginInstall(props.row.repo);
				}}
			>
				{msg.repos_finish_setup()}
			</Button>
		);
	}
	return (
		<Button
			variant="ghost"
			onPress={() => {
				props.install.beginResync(props.row.repo);
			}}
		>
			{msg.repos_recopy()}
		</Button>
	);
}

function RepoSettingsActions(props: {
	install: ReturnType<typeof useRepoInstall>;
	onDisabled: () => void;
	row: EnabledRepo;
}): ReactNode {
	const disableMutation = useMutation({
		mutationFn: async () =>
			disableRepoFn({ data: { repo: props.row.repo.id } }),
		onSuccess: () => {
			props.onDisabled();
		},
	});

	return (
		<>
			<div className="mt-4 flex flex-wrap gap-2">
				<InstallOrResyncButton install={props.install} row={props.row} />
				<Button
					variant="ghost"
					isDisabled={disableMutation.isPending}
					onPress={() => {
						disableMutation.mutate();
					}}
				>
					{msg.repos_stop()}
				</Button>
			</div>
			{disableMutation.isError ? (
				<div className="mt-2">
					<ErrorMessage>
						{errorMessage(disableMutation.error, msg.repos_stop_failed())}
					</ErrorMessage>
				</div>
			) : undefined}
		</>
	);
}

interface EnabledRepoSettingsPageProps {
	allSlots: readonly ModelSlot[];
	botLink: HostedBotInstallLink | undefined;
	botLinkError: string | undefined;
	install: ReturnType<typeof useRepoInstall>;
	lastWake: LastWake | undefined;
	onBack: () => void;
	onDisabled: () => void;
	onInvalidate: () => Promise<void>;
	row: EnabledRepo;
	vaultEpoch: number;
}

export function EnabledRepoSettingsPage(
	props: EnabledRepoSettingsPageProps,
): ReactNode {
	return (
		<div>
			<Button className="mb-4" variant="ghost" onPress={props.onBack}>
				{msg.repos_back()}
			</Button>
			<h2 className="text-accent-strong ink-outline m-0 text-3xl font-bold">
				<GithubRepoLink repo={props.row.repo} />
			</h2>
			<p className="text-ink/60 m-0 mt-1 text-sm">
				{repoStatusParts(props.row, props.vaultEpoch).join(" · ")}
			</p>
			<div className="mt-2">
				<LastWakeView lastWake={props.lastWake} />
			</div>
			<RepoSettingsActions
				install={props.install}
				onDisabled={props.onDisabled}
				row={props.row}
			/>
			<div className="mt-6">
				<RepoInstallNotes
					botLink={props.botLink}
					install={props.install}
					row={props.row}
					vaultEpoch={props.vaultEpoch}
				/>
				<RepoWakeSettingsBox
					onInvalidate={props.onInvalidate}
					row={props.row}
				/>
				<RepoBrainsSection allSlots={props.allSlots} repo={props.row.repo.id} />
				<ReviewInstructions
					ignorePaths={props.row.ignorePaths}
					onSaved={props.onInvalidate}
					prompt={props.row.prompt}
					repo={props.row.repo.id}
				/>
			</div>
		</div>
	);
}
