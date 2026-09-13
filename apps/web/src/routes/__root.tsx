import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";

import { RootDocument } from "#/components/root-document.tsx";
import { m as msg } from "#/paraglide/messages.js";

import appCss from "#/styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		links: [
			{
				href: appCss,
				rel: "stylesheet",
			},
		],
		meta: [
			{
				charSet: "utf8",
			},
			{
				content: "width=device-width, initial-scale=1",
				name: "viewport",
			},
			{
				title: msg.meta_title(),
			},
			{
				content: msg.meta_description(),
				name: "description",
			},
		],
	}),
	shellComponent: RootDocument,
});
