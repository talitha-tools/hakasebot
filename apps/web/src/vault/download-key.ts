import type { EncryptionKey } from "@hakasebot/core/vault/domain.ts";

import { m as msg } from "#/paraglide/messages.js";

export function downloadEncryptionKey(key: EncryptionKey): void {
	const objectUrl = URL.createObjectURL(
		new Blob([key], { type: "text/plain;charset=utf-8" }),
	);
	const anchor = document.createElement("a");
	anchor.download = msg.key_filename();
	anchor.href = objectUrl;
	try {
		anchor.click();
	} finally {
		URL.revokeObjectURL(objectUrl);
	}
}
