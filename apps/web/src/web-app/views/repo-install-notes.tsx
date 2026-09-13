import type { ReactNode } from "react";

import { button } from "#/components/ui/button-variants.ts";
import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import type { HostedBotInstallLink } from "#/deployment-config.ts";
import { m as msg } from "#/paraglide/messages.js";
import type { EnabledRepo } from "#/web-app/domain.ts";
import { formatRepoRef } from "#/web-app/domain.ts";
import {
	machineStageToInstallStep,
	repoNeedsResync,
} from "#/web-app/machine.ts";
import type { RepoInstallState } from "#/web-app/messages.ts";
import { installStepLabel } from "#/web-app/search.ts";
import type { useRepoInstall } from "#/web-app/use-repo-install.ts";

type FailedInstall = Extract<RepoInstallState, { kind: "failed" }>;

function BotGrantLink(props: {
	botLink: HostedBotInstallLink | undefined;
	repoLabel: string;
}): ReactNode {
	if (props.botLink?.kind !== "configured") {
		return undefined;
	}
	return (
		<div className="mt-2 grid gap-2">
			<p className="text-ink/75 m-0 text-sm">{msg.install_grant_hint()}</p>
			<a
				className={button({
					className:
						"h-auto flex-col items-start gap-1 px-3 py-3 text-left no-underline",
					variant: "primary",
				})}
				href={props.botLink.url}
				rel="noreferrer"
				target="_blank"
			>
				<span className="font-bold">
					{msg.install_grant_cta({
						repo: props.repoLabel,
					})}
				</span>
			</a>
		</div>
	);
}

function InstallFailedBanner(props: {
	botLink: HostedBotInstallLink | undefined;
	failed: FailedInstall;
	install: ReturnType<typeof useRepoInstall>;
	repoLabel: string;
}): ReactNode {
	return (
		<div className="mb-3">
			<ErrorMessage>
				{installStepLabel(machineStageToInstallStep(props.failed.stage))}:{" "}
				{props.failed.message}
			</ErrorMessage>
			{props.failed.stage === "bot" ? (
				<BotGrantLink botLink={props.botLink} repoLabel={props.repoLabel} />
			) : undefined}
			<div className="mt-2 flex gap-2">
				<Button
					variant="ghost"
					onPress={() => {
						props.install.retry();
					}}
				>
					{msg.install_try_again()}
				</Button>
				<Button
					variant="ghost"
					onPress={() => {
						props.install.cancel();
					}}
				>
					{msg.install_never_mind()}
				</Button>
			</div>
		</div>
	);
}

export function RepoInstallNotes(props: {
	botLink: HostedBotInstallLink | undefined;
	install: ReturnType<typeof useRepoInstall>;
	row: EnabledRepo;
	vaultEpoch: number;
}): ReactNode {
	const state = props.install.installState;
	const activeInstall =
		state.kind === "running" || state.kind === "failed" ? state : undefined;
	const installingThisRepo =
		activeInstall !== undefined && activeInstall.repo.id === props.row.repo.id;
	const stale = repoNeedsResync(props.row, props.vaultEpoch);

	return (
		<>
			{installingThisRepo && activeInstall?.kind === "failed" ? (
				<InstallFailedBanner
					botLink={props.botLink}
					failed={activeInstall}
					install={props.install}
					repoLabel={formatRepoRef(props.row.repo)}
				/>
			) : undefined}
			{installingThisRepo &&
			activeInstall?.kind === "running" &&
			activeInstall.stage === "bot" ? (
				<p className="text-ink/75 m-0 mb-4 text-sm">
					{msg.install_checking_helper()}
				</p>
			) : undefined}
			{installingThisRepo &&
			activeInstall?.kind === "running" &&
			activeInstall.stage === "secret_sync" ? (
				<p className="text-ink/75 m-0 mb-4 text-sm">
					{msg.install_running_step({
						step: installStepLabel("sync"),
					})}
				</p>
			) : undefined}
			{stale && props.row.lastSyncedAt !== undefined ? (
				<p className="text-ink/70 m-0 mb-4 text-sm">
					{msg.install_key_changed()}
				</p>
			) : undefined}
		</>
	);
}
