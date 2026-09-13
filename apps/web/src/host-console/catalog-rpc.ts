import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { clearWorkerModelCatalog } from "#/catalog-bindings.ts";

import { requireHostConsoleAuth } from "./auth.server.ts";

export const clearCatalogCacheFn = createServerFn({
	method: "POST",
}).handler(async () => {
	await requireHostConsoleAuth(getRequestHeader("authorization"));
	return clearWorkerModelCatalog();
});

export async function fetchClearCatalogCache(token: string) {
	return clearCatalogCacheFn({
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});
}
