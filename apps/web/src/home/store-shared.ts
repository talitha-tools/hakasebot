import { errorMessage } from "@hakasebot/core/error-message.ts";

import { m as msg } from "#/paraglide/messages.js";

export function storeError(error: unknown): {
	kind: "invalid";
	message: string;
} {
	return {
		kind: "invalid",
		message: errorMessage(error, msg.home_store_failed()),
	};
}
