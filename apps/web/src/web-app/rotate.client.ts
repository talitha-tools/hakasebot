import { generateEncryptionKey } from "@hakasebot/core/vault/crypto.ts";
import type { RotateVaultPreview } from "@hakasebot/core/vault/store.ts";

import { m as msg } from "#/paraglide/messages.js";
import {
	commitStagedEncryptionKey,
	discardStagedEncryptionKey,
	stageEncryptionKeyForRotate,
} from "#/vault/session-key.client.ts";

import { confirmRotateFn, rotateVaultFn } from "./rotate-rpc.ts";

export async function runEncryptionKeyRotate(args: {
	githubUserId: string;
	preview: RotateVaultPreview;
}): Promise<void> {
	const newKey = generateEncryptionKey();
	stageEncryptionKeyForRotate({ githubUserId: args.githubUserId, key: newKey });
	try {
		const repos = args.preview.repos.map((repo) => repo.id);
		await confirmRotateFn({
			data: {
				repos,
			},
		});
		await rotateVaultFn({
			data: {
				repos,
			},
		});
	} catch (error: unknown) {
		discardStagedEncryptionKey(args.githubUserId);
		throw error;
	}
	const committed = commitStagedEncryptionKey(args.githubUserId);
	if (committed === undefined) {
		throw new Error(msg.rotate_key_vanished());
	}
}
