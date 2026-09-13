import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";

import { readVaultGateSnapshot } from "./gate.server.ts";

export const vaultGateSnapshotFn = createServerFn({ method: "POST" }).handler(
	async () => {
		const snapshot = await readVaultGateSnapshot({
			cookieHeader: getRequestHeader("cookie") ?? "",
			request: getRequest(),
		});
		if (snapshot.kind === "invalid") {
			throw new Error(snapshot.message);
		}
		return snapshot.value;
	},
);
