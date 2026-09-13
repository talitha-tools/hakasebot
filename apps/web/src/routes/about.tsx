import { createFileRoute } from "@tanstack/react-router";

import { AboutPage } from "#/components/about-page.tsx";
import { readAboutPageFn } from "#/components/about-rpc.ts";

export const Route = createFileRoute("/about")({
	component: AboutPage,
	loader: async () => readAboutPageFn(),
});
