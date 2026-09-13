import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

import { auth } from "#/lib/auth";
import { preserveSetCookieHeaders } from "#/lib/auth-cookies";

// Live Start import loads the `server.handlers` augmentation for createFileRoute.
void createServerFn;

async function handleAuth(request: Request): Promise<Response> {
	return preserveSetCookieHeaders(await auth.handler(request));
}

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: async ({ request }) => handleAuth(request),
			POST: async ({ request }) => handleAuth(request),
		},
	},
});
