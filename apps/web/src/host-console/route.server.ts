import { notFound } from "@tanstack/react-router";

import type { HostConsoleAuthConfig } from "./auth.server.ts";
import { hostConsoleEnabled } from "./auth.server.ts";

export function ensureHostConsoleRoute(config?: HostConsoleAuthConfig): void {
	if (!hostConsoleEnabled(config)) {
		// oxlint-disable-next-line typescript/only-throw-error -- TanStack notFound control flow
		throw notFound();
	}
}
