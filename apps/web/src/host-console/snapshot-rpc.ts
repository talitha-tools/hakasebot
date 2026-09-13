import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { requireHostConsoleAuth } from "./auth.server.ts";
import { readHostConsoleSnapshot } from "./snapshot.server.ts";

export const hostSnapshotFn = createServerFn({
	method: "POST",
}).handler(async () => {
	await requireHostConsoleAuth(getRequestHeader("authorization"));
	return readHostConsoleSnapshot();
});

export async function fetchHostSnapshot(token: string) {
	return hostSnapshotFn({
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});
}
