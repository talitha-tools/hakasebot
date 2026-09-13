import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "#/lab/home-page.tsx";
import type { RawWebAppSearch } from "#/web-app/use-web-app-search.ts";

export const Route = createFileRoute("/")({
	component: HomePage,
	validateSearch: (search: Record<string, unknown>): RawWebAppSearch => {
		const next: RawWebAppSearch = {};
		const { tab } = search;
		const { repo } = search;
		const { install } = search;
		const { view } = search;
		if (typeof tab === "string") {
			next.tab = tab;
		}
		if (typeof repo === "string") {
			next.repo = repo;
		}
		if (typeof install === "string") {
			next.install = install;
		}
		if (typeof view === "string") {
			next.view = view;
		}
		return next;
	},
});
