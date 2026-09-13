import { createServerFn } from "@tanstack/react-start";
import {
	getRequestHeader,
	setResponseHeader,
} from "@tanstack/react-start/server";

import type { RelayedToken } from "#/vendor-login/vendor-login.server.ts";
import {
	parseRelayInput,
	relayVendorToken,
} from "#/vendor-login/vendor-login.server.ts";

/**
 * The relay leg of the venue ladder. Lab sign-in gates it and the vendor URL
 * comes from the core allowlist, not the caller. Deliberately a plain server fn
 * rather than a route under `/api/auth/*`: GitHub sign-in is never reused here.
 */
export const relayVendorTokenFn = createServerFn({ method: "POST" })
	.validator((input: { body: string; kind: string; url: string }) => {
		const parsed = parseRelayInput(input);
		if (parsed.kind === "invalid") {
			throw new Error(parsed.message);
		}
		return parsed.value;
	})
	.handler(async ({ data }): Promise<RelayedToken> => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		setResponseHeader("cache-control", "no-store");
		const relayed = await relayVendorToken({ cookieHeader, request: data });
		if (relayed.kind === "invalid") {
			throw new Error(relayed.message);
		}
		return relayed.value;
	});
