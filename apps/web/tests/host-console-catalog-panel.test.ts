import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { CatalogPanel } from "#/host-console/views/catalog-panel.tsx";

test("catalog panel shows forget-lists copy", () => {
	const client = new QueryClient();
	const markup = renderToStaticMarkup(
		createElement(
			QueryClientProvider,
			{ client },
			createElement(CatalogPanel, { token: "host-token" }),
		),
	);

	expect(markup).toContain("forget the lists");
	expect(markup).toContain("forget the brain lists");
	expect(markup).toContain(
		"brain ids live in KV for a day. this drops them. next picker open fetches fresh.",
	);
});
