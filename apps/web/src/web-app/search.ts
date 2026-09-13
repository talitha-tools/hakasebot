import { parseRepoRef } from "@hakasebot/core/domain.ts";

import { m as msg } from "#/paraglide/messages.js";

import type { WebAppSearch, WebAppTab, InstallStep } from "./domain.ts";
import { WEB_APP_TABS, formatRepoRef } from "./domain.ts";

const INSTALL_ALIASES: Record<string, InstallStep> = {
	bot: "bot",
	secret_sync: "sync",
	sync: "sync",
};

export function isWebAppTab(value: string): value is WebAppTab {
	return (WEB_APP_TABS as readonly string[]).includes(value);
}

export function visibleTabs(args: {
	hasSyncedRepo: boolean;
}): readonly WebAppTab[] {
	if (args.hasSyncedRepo) {
		return WEB_APP_TABS.filter((tab) => tab !== "onboarding");
	}
	return WEB_APP_TABS;
}

export function defaultTab(visible: readonly WebAppTab[]): WebAppTab {
	return visible.includes("onboarding") ? "onboarding" : "accounts";
}

export function resolveTab(args: {
	requested: string | undefined;
	visible: readonly WebAppTab[];
}): WebAppTab {
	if (args.requested !== undefined && isWebAppTab(args.requested)) {
		return args.visible.includes(args.requested)
			? args.requested
			: defaultTab(args.visible);
	}
	return defaultTab(args.visible);
}

function parseInstallStep(raw: string | undefined): InstallStep | undefined {
	if (raw === undefined) {
		return undefined;
	}
	return INSTALL_ALIASES[raw];
}

function parseRepoParam(
	raw: string | undefined,
): WebAppSearch["repo"] | undefined {
	if (raw === undefined || raw.trim().length === 0) {
		return undefined;
	}
	const parsed = parseRepoRef(raw.trim());
	if (parsed.kind === "invalid") {
		return undefined;
	}
	return parsed.value;
}

function parseReposView(
	raw: string | undefined,
): WebAppSearch["view"] | undefined {
	if (raw === "defaults") {
		return "defaults";
	}
	return undefined;
}

export function parseWebAppSearch(
	params: URLSearchParams,
	ctx: { hasSyncedRepo: boolean },
): WebAppSearch {
	const visible = visibleTabs(ctx);
	const tab = resolveTab({
		requested: params.get("tab") ?? undefined,
		visible,
	});
	if (tab !== "repos") {
		return { install: undefined, repo: undefined, tab, view: undefined };
	}
	const view = parseReposView(params.get("view") ?? undefined);
	if (view === "defaults") {
		return { install: undefined, repo: undefined, tab, view };
	}
	const repo = parseRepoParam(params.get("repo") ?? undefined);
	const install =
		repo === undefined
			? undefined
			: parseInstallStep(params.get("install") ?? undefined);
	return { install, repo, tab, view: undefined };
}

export function buildWebAppSearch(
	search: WebAppSearch,
): Record<string, string | undefined> {
	const next: Record<string, string | undefined> = {
		install: undefined,
		repo: undefined,
		tab: search.tab,
		view: undefined,
	};
	if (search.tab === "repos") {
		if (search.view === "defaults") {
			next["view"] = "defaults";
			return next;
		}
		if (search.repo !== undefined) {
			next["repo"] = formatRepoRef(search.repo);
			if (search.install !== undefined) {
				next["install"] = search.install;
			}
		}
	}
	return next;
}

export function webAppSearchToParams(search: WebAppSearch): URLSearchParams {
	const params = new URLSearchParams();
	const built = buildWebAppSearch(search);
	for (const [key, value] of Object.entries(built)) {
		if (value !== undefined) {
			params.set(key, value);
		}
	}
	return params;
}

export function installStepLabel(step: InstallStep): string {
	switch (step) {
		case "bot": {
			return msg.install_step_bot();
		}
		case "sync": {
			return msg.install_step_sync();
		}
	}
}
