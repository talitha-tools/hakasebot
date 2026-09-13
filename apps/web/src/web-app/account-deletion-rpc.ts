import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

import {
	deleteAccount,
	previewAccountDeletion,
} from "./account-deletion.server.ts";

export const previewAccountDeletionFn = createServerFn({
	method: "POST",
}).handler(async () => {
	const cookieHeader = getRequestHeader("cookie") ?? "";
	const preview = await previewAccountDeletion({ cookieHeader });
	if (preview.kind === "invalid") {
		throw new Error(preview.message);
	}
	return preview.value;
});

export const deleteAccountFn = createServerFn({ method: "POST" }).handler(
	async () => {
		const cookieHeader = getRequestHeader("cookie") ?? "";
		const deleted = await deleteAccount({ cookieHeader });
		if (deleted.kind === "invalid") {
			throw new Error(deleted.message);
		}
	},
);
