import type {
	EngineKind,
	ModelCatalog,
	ParseResult,
} from "@hakasebot/core/domain.ts";
import {
	repoPrefsForConsumer,
	slotsForConsumer,
} from "@hakasebot/core/home/prefs.ts";
import { NO_MODEL_SLOTS_MESSAGE } from "@hakasebot/core/home/runtime-pack.ts";
import {
	VAULT_SECRET_NAMES,
	encryptionKey,
} from "@hakasebot/core/vault/domain.ts";
import type {
	CredentialVault,
	EncryptionKey,
} from "@hakasebot/core/vault/domain.ts";
import { buildModelQueue } from "@hakasebot/core/vault/model-slot.ts";
import type { ModelQueue } from "@hakasebot/core/vault/model-slot.ts";

import { fetchRuntimePack } from "./lab-client.ts";
import { actionInput } from "./run-config.ts";
import type { HomeRunInputs } from "./run-inputs.ts";

export interface ReviewMaterials {
	catalogs: Partial<Record<EngineKind, ModelCatalog>>;
	dashboardPrompt: string | undefined;
	ignorePaths: readonly string[] | undefined;
	key: EncryptionKey;
	queue: ModelQueue;
	vault: CredentialVault;
}

/** Encryption key precedence: runner secret env first, then the Action input. */
function encryptionKeyFromEnv(
	env: Record<string, string | undefined>,
): ParseResult<EncryptionKey> {
	const raw =
		env[VAULT_SECRET_NAMES.encryptionKey] ?? actionInput(env, "encryption_key");
	if (raw === undefined) {
		return {
			kind: "invalid",
			message: "the house is missing the encryption key",
		};
	}
	return encryptionKey(raw);
}

/** Decrypt-side inputs for the run: encryption key, runtime pack, model queue. */
export async function loadReviewMaterials(args: {
	env: Record<string, string | undefined>;
	fetchImpl?: typeof fetch;
	fetchRuntimePack?: typeof fetchRuntimePack;
	inputs: HomeRunInputs;
}): Promise<ParseResult<ReviewMaterials>> {
	const key = encryptionKeyFromEnv(args.env);
	if (key.kind === "invalid") {
		return key;
	}
	const loadPack = args.fetchRuntimePack ?? fetchRuntimePack;
	const pack = await loadPack({
		dispatchId: args.inputs.dispatchId,
		env: args.env,
		...(args.fetchImpl === undefined ? {} : { fetchImpl: args.fetchImpl }),
	});
	if (pack.kind === "invalid") {
		return pack;
	}
	const queue = buildModelQueue(
		slotsForConsumer({
			consumer: args.inputs.consumer,
			prefs: pack.value.prefs,
		}),
	);
	if (queue.entries.length === 0) {
		return { kind: "invalid", message: NO_MODEL_SLOTS_MESSAGE };
	}
	const repoPrefs = repoPrefsForConsumer({
		consumer: args.inputs.consumer,
		prefs: pack.value.prefs,
	});
	return {
		kind: "ok",
		value: {
			catalogs: pack.value.catalogs,
			dashboardPrompt: repoPrefs?.prompt,
			ignorePaths: repoPrefs?.ignorePaths,
			key: key.value,
			queue,
			vault: pack.value.vault,
		},
	};
}
