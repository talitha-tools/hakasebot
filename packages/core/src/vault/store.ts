/** Facade: D1 vault store split into cohesive modules; import path stays stable. */
import { createAppDb } from "#/db/client.ts";
import type { D1DatabaseLike } from "#/db/types.ts";

import type { EncryptionKey } from "./domain.ts";
import { createVaultAccountStore } from "./store/accounts.ts";
import { createEnabledRepoStore } from "./store/enabled-repos.ts";
import { createRepoModelListStore } from "./store/repo-model-list.ts";
import { createRepoSettingsStore } from "./store/repo-settings.ts";
import { createVaultRotationStore } from "./store/rotate.ts";
import { createModelSlotStore } from "./store/slots.ts";
import type { VaultStore } from "./store/types.ts";

export type {
	D1DatabaseLike,
	D1PreparedStatement,
	EnabledRepoRow,
	MarkRepoSyncedArgs,
	RotateVaultPreview,
	SaveVaultAccountArgs,
	SetRepoAutoAuthorsArgs,
	SetRepoAutoBranchesArgs,
	SetRepoAutoReviewCadenceArgs,
	SetRepoModelListArgs,
	SetRepoReviewInstructionsArgs,
	VaultStore,
} from "./store/types.ts";
export { d1Present, isD1Database } from "./store/types.ts";

export function createD1VaultStore(d1: D1DatabaseLike): VaultStore {
	const db = createAppDb(d1);
	return {
		...createVaultAccountStore(db),
		...createVaultRotationStore(db),
		...createModelSlotStore(db),
		...createRepoModelListStore(db),
		...createEnabledRepoStore(db),
		...createRepoSettingsStore(db),
	};
}

export function buildRepoSyncPayload(args: { encryptionKey: EncryptionKey }): {
	encryptionKey: EncryptionKey;
} {
	return {
		encryptionKey: args.encryptionKey,
	};
}
