import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { ErrorMessage } from "#/components/ui/error-message.tsx";
import { m as msg } from "#/paraglide/messages.js";

import type { WebAppSearch, WebAppTab } from "./domain.ts";
import { buildWebAppSearch, visibleTabs } from "./search.ts";
import { webAppSnapshotFn } from "./snapshot-rpc.ts";
import { useWebAppSearch } from "./use-web-app-search.ts";
import { AccountsPanel } from "./views/accounts-panel.tsx";
import { ModelsPanel } from "./views/models-panel.tsx";
import { OnboardingPanel } from "./views/onboarding-panel.tsx";
import { ReposPanel } from "./views/repos-panel.tsx";
import { SettingsPanel } from "./views/settings-panel.tsx";

const homeRoute = getRouteApi("/");

const TAB_LABELS: Record<WebAppTab, () => string> = {
	accounts: msg.tab_accounts,
	models: msg.tab_models,
	onboarding: msg.tab_onboarding,
	repos: msg.tab_repos,
	settings: msg.tab_settings,
};

function PanelMount(props: {
	active: boolean;
	children: ReactNode;
}): ReactNode {
	return (
		<div
			className={props.active ? undefined : "hidden"}
			aria-hidden={!props.active}
		>
			{props.children}
		</div>
	);
}

function useCanonicalSearch(search: WebAppSearch, ready: boolean) {
	const navigate = homeRoute.useNavigate();
	const raw = homeRoute.useSearch();

	useEffect(() => {
		if (!ready) {
			return;
		}
		const canonical = buildWebAppSearch(search);
		const diverged =
			raw.tab !== canonical["tab"] ||
			(canonical["repo"] ?? undefined) !== raw.repo ||
			(canonical["install"] ?? undefined) !== raw.install ||
			(canonical["view"] ?? undefined) !== raw.view ||
			(raw.repo !== undefined && canonical["repo"] === undefined) ||
			(raw.install !== undefined && canonical["install"] === undefined) ||
			(raw.view !== undefined && canonical["view"] === undefined);
		if (diverged) {
			void navigate({
				replace: true,
				search: canonical,
			});
		}
	}, [navigate, raw.install, raw.repo, raw.tab, raw.view, ready, search]);
}

function TabNav(props: {
	activeTab: WebAppTab;
	onPick: (tab: WebAppTab) => void;
	tabs: readonly WebAppTab[];
}): ReactNode {
	return (
		<nav aria-label={msg.shell_tabs_aria()}>
			<ul className="border-ink flex flex-wrap gap-2 border-b-2 pb-2">
				{props.tabs.map((tab) => {
					const active = props.activeTab === tab;
					return (
						<li key={tab}>
							<button
								type="button"
								aria-current={active ? "page" : undefined}
								className={
									active
										? "bg-accent text-ink border-ink border-2 px-3 py-1 font-bold"
										: "text-ink/75 hover:text-ink border-ink border-2 border-transparent px-3 py-1"
								}
								onClick={() => {
									props.onPick(tab);
								}}
							>
								{TAB_LABELS[tab]()}
							</button>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

function TabPanels(props: {
	search: WebAppSearch;
	setTab: (tab: WebAppTab) => void;
}): ReactNode {
	const { setTab } = props;
	return (
		<div className="mt-6">
			<PanelMount active={props.search.tab === "onboarding"}>
				<OnboardingPanel onNavigate={setTab} />
			</PanelMount>
			<PanelMount active={props.search.tab === "accounts"}>
				<AccountsPanel />
			</PanelMount>
			<PanelMount active={props.search.tab === "models"}>
				<ModelsPanel />
			</PanelMount>
			<PanelMount active={props.search.tab === "repos"}>
				<ReposPanel search={props.search} />
			</PanelMount>
			<PanelMount active={props.search.tab === "settings"}>
				<SettingsPanel />
			</PanelMount>
		</div>
	);
}

export function WebAppShell(): ReactNode {
	const snapshotQuery = useQuery({
		queryFn: async () => webAppSnapshotFn(),
		queryKey: ["web-app", "snapshot"],
		staleTime: 30_000,
	});
	const hasSyncedRepo = snapshotQuery.data?.hasSyncedRepo ?? false;
	const { search, setTab } = useWebAppSearch({ hasSyncedRepo });
	const tabs = visibleTabs({ hasSyncedRepo });
	useCanonicalSearch(search, snapshotQuery.isSuccess);

	if (snapshotQuery.isPending) {
		return (
			<main className="mx-auto max-w-[56rem] px-4 py-8 sm:px-6">
				<p className="text-ink/50 m-0">{msg.shell_peeking()}</p>
			</main>
		);
	}

	if (snapshotQuery.isError) {
		return (
			<main className="mx-auto max-w-[56rem] px-4 py-8 sm:px-6">
				<ErrorMessage>
					{snapshotQuery.error instanceof Error
						? snapshotQuery.error.message
						: msg.shell_flopped()}
				</ErrorMessage>
			</main>
		);
	}

	return (
		<main className="mx-auto max-w-[56rem] px-4 py-8 sm:px-6">
			<TabNav activeTab={search.tab} onPick={setTab} tabs={tabs} />
			<TabPanels search={search} setTab={setTab} />
		</main>
	);
}
