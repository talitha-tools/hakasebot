import { handleClaimStatusGet } from "@hakasebot/core/claim-status.ts";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { createHomeStore, d1FromWorkerEnv } from "#/home/store.ts";

void createServerFn;

export const Route = createFileRoute("/api/claim-status")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const db = await d1FromWorkerEnv();
				if (db === undefined) {
					return handleClaimStatusGet({ url: new URL(request.url) });
				}
				const store = createHomeStore(db);
				return handleClaimStatusGet({
					findRoute: async (repo) => store.findRoute(repo),
					url: new URL(request.url),
				});
			},
		},
	},
});
