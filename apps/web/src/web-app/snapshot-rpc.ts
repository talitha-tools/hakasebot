import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import { readWebAppSnapshot } from "./snapshot.server.ts";

export const webAppSnapshotFn = createServerFn({
	method: "POST",
}).handler(async () => {
	const cookieHeader = getRequestHeader("cookie") ?? "";
	const snapshot = await readWebAppSnapshot({ cookieHeader });
	if (snapshot.kind === "invalid") {
		throw new Error(snapshot.message);
	}
	return snapshot.value;
});
