import type { RepoRefParts } from "@hakasebot/core/domain.ts";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button.tsx";
import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { Label } from "#/components/ui/label.tsx";
import { Section } from "#/components/ui/section.tsx";
import type { HostedBotInstallLink } from "#/deployment-config.ts";
import { m as msg } from "#/paraglide/messages.js";
import type { EnabledRepo, WebAppSearch } from "#/web-app/domain.ts";
import { sameRepoParts } from "#/web-app/domain.ts";
import type { useRepoInstall } from "#/web-app/use-repo-install.ts";

import {
	EnabledRepoListItem,
	EnabledRepoSettingsPage,
} from "./enabled-repo-row.tsx";
import { HelperInstallBox } from "./helper-install-box.tsx";
import { AddRepoSection } from "./repo-picker.tsx";
import { RepoSettingDefaultsPanel } from "./repo-setting-defaults.tsx";
import {
	useBotLink,
	useRepoActions,
	useRepoNav,
	useRepoPicker,
	useReposPanelData,
} from "./use-repos-panel.ts";
import type { ReposPanelData, useEnableRepo } from "./use-repos-panel.ts";

function EnabledRepoList(props: {
	data: ReposPanelData;
	onOpen: (row: EnabledRepo) => void;
}): ReactNode {
	if (props.data.enabledPending) {
		return <p className="text-ink/50 m-0 mt-4">{msg.repos_looking()}</p>;
	}
	if (props.data.enabledRepos.length === 0) {
		return <p className="text-ink/50 m-0 mt-4">{msg.repos_empty()}</p>;
	}
	return (
		<ul className="mt-4 flex flex-col gap-4">
			{props.data.enabledRepos.map((row) => (
				<EnabledRepoListItem
					key={row.repo.id}
					lastWake={props.data.lastWakes?.[row.repo.id]}
					onOpen={() => {
						props.onOpen(row);
					}}
					row={row}
					vaultEpoch={props.data.vaultEpoch}
				/>
			))}
		</ul>
	);
}

function MissingRepoSection(props: { onBack: () => void }): ReactNode {
	return (
		<Section>
			<Button className="mb-4" variant="ghost" onPress={props.onBack}>
				{msg.repos_back()}
			</Button>
			<ErrorMessage>{msg.repos_missing()}</ErrorMessage>
		</Section>
	);
}

function SelectedRepoSection(props: {
	botLink: HostedBotInstallLink | undefined;
	botLinkError: string | undefined;
	data: ReposPanelData;
	install: ReturnType<typeof useRepoInstall>;
	onBack: () => void;
	selectedParts: RepoRefParts;
}): ReactNode {
	if (props.data.enabledPending) {
		return (
			<Section>
				<p className="text-ink/50 m-0">{msg.repos_looking()}</p>
			</Section>
		);
	}
	const selectedRow = props.data.enabledRepos.find((row) =>
		sameRepoParts(props.selectedParts, row.repo),
	);
	if (selectedRow === undefined) {
		return <MissingRepoSection onBack={props.onBack} />;
	}
	const { invalidateRepos } = props.data;
	return (
		<Section>
			<EnabledRepoSettingsPage
				allSlots={props.data.allSlots}
				botLink={props.botLink}
				botLinkError={props.botLinkError}
				install={props.install}
				lastWake={props.data.lastWakes?.[selectedRow.repo.id]}
				onBack={props.onBack}
				onDisabled={() => {
					void (async () => {
						await invalidateRepos();
						props.onBack();
					})();
				}}
				onInvalidate={invalidateRepos}
				row={selectedRow}
				vaultEpoch={props.data.vaultEpoch}
			/>
		</Section>
	);
}

function ReposListPage(props: {
	bot: ReturnType<typeof useBotLink>;
	data: ReposPanelData;
	enable: ReturnType<typeof useEnableRepo>;
	onDefaults: () => void;
	onOpen: (row: EnabledRepo) => void;
	picker: ReturnType<typeof useRepoPicker>;
}): ReactNode {
	const { refresh } = props.picker;
	const enabledKeys = new Set(
		props.data.enabledRepos.map((row) => row.repo.id),
	);

	return (
		<Section>
			<Label>{msg.repos_label()}</Label>
			<h2 className="text-accent-strong ink-outline mt-1 text-3xl font-bold">
				{msg.repos_heading()}
			</h2>
			<p className="text-ink/75 mt-2 mb-0 max-w-[48ch]">{msg.repos_intro()}</p>
			<HelperInstallBox
				botLink={props.bot.botLink}
				botLinkError={props.bot.error}
				onDefaults={props.onDefaults}
				onRefresh={refresh}
			/>
			<AddRepoSection
				enable={props.enable}
				enabledKeys={enabledKeys}
				picker={props.picker}
			/>
			<EnabledRepoList data={props.data} onOpen={props.onOpen} />
		</Section>
	);
}

export function ReposPanel(props: { search: WebAppSearch }): ReactNode {
	const data = useReposPanelData();
	const nav = useRepoNav(data.hasSyncedRepo);
	const { goDefaults, goList, openRepo } = nav;
	const picker = useRepoPicker();
	const bot = useBotLink();
	const { enable, install } = useRepoActions({ data, nav });

	if (props.search.view === "defaults") {
		return (
			<Section>
				<RepoSettingDefaultsPanel
					githubUserId={data.githubUserId}
					onBack={goList}
				/>
			</Section>
		);
	}
	if (props.search.repo !== undefined) {
		return (
			<SelectedRepoSection
				botLink={bot.botLink}
				botLinkError={bot.error}
				data={data}
				install={install}
				onBack={goList}
				selectedParts={props.search.repo}
			/>
		);
	}
	return (
		<ReposListPage
			bot={bot}
			data={data}
			enable={enable}
			onDefaults={goDefaults}
			onOpen={(row) => {
				openRepo(row.repo);
			}}
			picker={picker}
		/>
	);
}
