import { createFileRoute } from "@tanstack/react-router";

import { HostConsoleGate } from "#/host-console/gate.tsx";
import { ensureHostConsoleRouteFn } from "#/host-console/route-rpc.ts";

export const Route = createFileRoute("/host")({
	component: HostConsoleGate,
	loader: async () => ensureHostConsoleRouteFn(),
});
