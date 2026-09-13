import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { handleGithubWakeRequest } from "#/wake/handle.server.ts";

void createServerFn;

export const Route = createFileRoute("/api/github-webhook")({
	server: {
		handlers: {
			POST: async ({ request }) => handleGithubWakeRequest(request),
		},
	},
});
