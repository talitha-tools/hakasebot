import { getRouteApi } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import type { WebAppSearch, WebAppTab } from "./domain.ts";
import { buildWebAppSearch, parseWebAppSearch } from "./search.ts";

const homeRoute = getRouteApi("/");

export interface RawWebAppSearch {
	tab?: string;
	repo?: string;
	install?: string;
	view?: string;
}

function rawSearchParams(raw: {
	install: string | undefined;
	repo: string | undefined;
	tab: string | undefined;
	view: string | undefined;
}): URLSearchParams {
	const params = new URLSearchParams();
	if (raw.tab !== undefined) {
		params.set("tab", raw.tab);
	}
	if (raw.repo !== undefined) {
		params.set("repo", raw.repo);
	}
	if (raw.install !== undefined) {
		params.set("install", raw.install);
	}
	if (raw.view !== undefined) {
		params.set("view", raw.view);
	}
	return params;
}

export function useWebAppSearch(args: { hasSyncedRepo: boolean }): {
	search: WebAppSearch;
	setTab: (tab: WebAppTab) => void;
	setReposSearch: (
		next: Pick<WebAppSearch, "repo" | "install" | "view">,
	) => void;
} {
	const raw = homeRoute.useSearch();
	const navigate = homeRoute.useNavigate();

	const search = useMemo(
		() =>
			parseWebAppSearch(
				rawSearchParams({
					install: raw.install,
					repo: raw.repo,
					tab: raw.tab,
					view: raw.view,
				}),
				{ hasSyncedRepo: args.hasSyncedRepo },
			),
		[args.hasSyncedRepo, raw.install, raw.repo, raw.tab, raw.view],
	);

	const setTab = useCallback(
		(tab: WebAppTab) => {
			const next = buildWebAppSearch({ ...search, tab });
			void navigate({
				replace: true,
				search: next,
			});
		},
		[navigate, search],
	);

	const setReposSearch = useCallback(
		(next: Pick<WebAppSearch, "repo" | "install" | "view">) => {
			const built = buildWebAppSearch({
				...search,
				tab: "repos",
				install: next.install,
				repo: next.repo,
				view: next.view,
			});
			void navigate({
				replace: true,
				search: built,
			});
		},
		[navigate, search],
	);

	return { search, setReposSearch, setTab };
}
