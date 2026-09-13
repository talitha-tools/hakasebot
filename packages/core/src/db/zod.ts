import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import type { ZodType } from "zod";

import type { ParseResult } from "#/domain.ts";
import { parseInvalid, parseOk } from "#/domain.ts";

import {
	enabledRepos,
	encryptionKeyMeta,
	homeRepos,
	modelSlots,
	repoModelList,
	repoModelListMeta,
	repoRoutes,
	repoSettingDefaults,
	vaultAccounts,
	wakeRuns,
	webhookReceipts,
} from "./schema.ts";
import type {
	EnabledRepoRecord,
	EncryptionKeyMetaRecord,
	HomeRepoRecord,
	ModelSlotRecord,
	RepoModelListMetaRecord,
	RepoModelListRecord,
	RepoRouteRecord,
	RepoSettingDefaultsRecord,
	VaultAccountRecord,
	WakeRunRecord,
	WebhookReceiptRecord,
} from "./schema.ts";

type VaultAccountMetaRecord = Pick<
	VaultAccountRecord,
	"createdAt" | "engine" | "id" | "label"
>;
type VaultSealedRecord = Pick<VaultAccountRecord, "ciphertext" | "id" | "iv">;
type RepoRefRecord = Pick<
	EnabledRepoRecord,
	"repoId" | "repoName" | "repoOwner"
>;
type ReleasedRepoRecord = Pick<
	RepoRouteRecord,
	"githubUserId" | "repoId" | "repoName" | "repoOwner"
>;
type WebhookReceiptFields = Pick<
	WebhookReceiptRecord,
	"eventName" | "outcome" | "receivedAt"
>;
type WakeAutoPrRecord = Pick<
	WakeRunRecord,
	"dispatchId" | "status" | "wakeKey"
>;
type WakeStatusRecord = Pick<WakeRunRecord, "status">;
type WakeDispatchRecord = Pick<WakeRunRecord, "dispatchId">;
type WakeSupersedeRecord = Pick<
	WakeRunRecord,
	"createdAt" | "dispatchId" | "runUrl"
>;
type VaultEpochRecord = Pick<EncryptionKeyMetaRecord, "epoch">;
type RepoModelOverrideRecord = Pick<
	RepoModelListRecord,
	"slotId" | "sortIndex"
>;
type RepoModelListUpdatedRecord = Pick<RepoModelListMetaRecord, "updatedAt">;
type RepoSettingDefaultsFields = Pick<
	RepoSettingDefaultsRecord,
	"autoAuthors" | "autoBranches" | "autoReviewCadence" | "wakeMode"
>;
type ModelSlotCreatedAtRecord = Pick<ModelSlotRecord, "createdAt">;
type HomeRepoRefRecord = Pick<
	HomeRepoRecord,
	"repoId" | "repoName" | "repoOwner"
>;
type EnabledSyncedRecord = Pick<EnabledRepoRecord, "lastSyncedAt">;
interface LastWakeJoinRecord {
	created_at: number | string;
	pull_number: number | string;
	repo_id: string;
	repo_name: string;
	repo_owner: string;
	run_url: string | null | undefined;
	status: string;
}
interface WakeRuntimePackRecord {
	consumerName: string;
	consumerOwner: string;
	consumerRepoId: string;
	githubUserId: string;
}
interface WakeRouteJoinRecord {
	autoAuthorSkip: string | null;
	autoAuthors: string | null;
	autoBranchList: string | null;
	autoBranchSkip: string | null;
	autoBranches: string | null;
	autoReviewCadence: string | null;
	generation: number;
	githubUserId: string;
	homeName: string | null;
	homeOwner: string | null;
	homeRepoId: string | null;
	installationId: string | null;
	wakeMode: string | null;
}

function asSelect<T>(schema: {
	safeParse: (value: unknown) => unknown;
}): ZodType<T> {
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- drizzle-zod select output matches InferSelectModel
	return schema as unknown as ZodType<T>;
}

const nullableText = z.string().nullable();
const sqliteInt = z.union([z.number(), z.string()]);
const vaultAccountSelectObject = createSelectSchema(vaultAccounts);
const repoRouteSelectObject = createSelectSchema(repoRoutes);
const wakeRunsSelectObject = createSelectSchema(wakeRuns);
const enabledReposSelectObject = createSelectSchema(enabledRepos);
const homeReposSelectObject = createSelectSchema(homeRepos);
const modelSlotsSelectObject = createSelectSchema(modelSlots);
const encryptionKeyMetaSelectObject = createSelectSchema(encryptionKeyMeta);
const repoModelListSelectObject = createSelectSchema(repoModelList);
const repoModelListMetaSelectObject = createSelectSchema(repoModelListMeta);
const repoSettingDefaultsSelectObject = createSelectSchema(repoSettingDefaults);
const webhookReceiptsSelectObject = createSelectSchema(webhookReceipts);

export const vaultAccountSelect = asSelect<VaultAccountRecord>(
	vaultAccountSelectObject,
);
export const vaultAccountMetaSelect = asSelect<VaultAccountMetaRecord>(
	vaultAccountSelectObject.pick({
		createdAt: true,
		engine: true,
		id: true,
		label: true,
	}),
);
export const vaultSealedSelect = asSelect<VaultSealedRecord>(
	vaultAccountSelectObject.pick({
		ciphertext: true,
		id: true,
		iv: true,
	}),
);
export const vaultEpochSelect = asSelect<VaultEpochRecord>(
	encryptionKeyMetaSelectObject.pick({ epoch: true }),
);
export const modelSlotSelect = asSelect<ModelSlotRecord>(
	modelSlotsSelectObject,
);
export const modelSlotCreatedAtSelect = asSelect<ModelSlotCreatedAtRecord>(
	modelSlotsSelectObject.pick({ createdAt: true }),
);
export const enabledRepoSelect = asSelect<EnabledRepoRecord>(
	enabledReposSelectObject,
);
export const enabledRepoRefSelect = asSelect<RepoRefRecord>(
	enabledReposSelectObject.pick({
		repoId: true,
		repoName: true,
		repoOwner: true,
	}),
);
export const enabledRepoSyncedSelect = asSelect<EnabledSyncedRecord>(
	enabledReposSelectObject.pick({ lastSyncedAt: true }),
);
export const homeRepoSelect = asSelect<HomeRepoRecord>(homeReposSelectObject);
export const homeRepoRefSelect = asSelect<HomeRepoRefRecord>(
	homeReposSelectObject.pick({
		repoId: true,
		repoName: true,
		repoOwner: true,
	}),
);
export const repoRouteSelect = asSelect<RepoRouteRecord>(repoRouteSelectObject);
export const releasedRepoSelect = asSelect<ReleasedRepoRecord>(
	repoRouteSelectObject.pick({
		githubUserId: true,
		repoId: true,
		repoName: true,
		repoOwner: true,
	}),
);
export const repoModelOverrideSelect = asSelect<RepoModelOverrideRecord>(
	repoModelListSelectObject.pick({ slotId: true, sortIndex: true }),
);
export const repoModelListUpdatedSelect = asSelect<RepoModelListUpdatedRecord>(
	repoModelListMetaSelectObject.pick({ updatedAt: true }),
);
export const repoSettingDefaultsSelect = asSelect<RepoSettingDefaultsFields>(
	repoSettingDefaultsSelectObject.pick({
		autoAuthors: true,
		autoBranches: true,
		autoReviewCadence: true,
		wakeMode: true,
	}),
);
export const webhookReceiptSelect = asSelect<WebhookReceiptFields>(
	webhookReceiptsSelectObject.pick({
		eventName: true,
		outcome: true,
		receivedAt: true,
	}),
);
export const wakeAutoPrSelect = asSelect<WakeAutoPrRecord>(
	wakeRunsSelectObject.pick({
		dispatchId: true,
		status: true,
		wakeKey: true,
	}),
);
export const wakeStatusSelect = asSelect<WakeStatusRecord>(
	wakeRunsSelectObject.pick({ status: true }),
);
export const wakeDispatchSelect = asSelect<WakeDispatchRecord>(
	wakeRunsSelectObject.pick({ dispatchId: true }),
);
export const wakeSupersedeSelect = asSelect<WakeSupersedeRecord>(
	wakeRunsSelectObject.pick({
		createdAt: true,
		dispatchId: true,
		runUrl: true,
	}),
);
const wakeRuntimePackObject = z.object({
	consumerName: z.string(),
	consumerOwner: z.string(),
	consumerRepoId: z.string(),
	githubUserId: z.string(),
});
export const wakeRuntimePackSelect = asSelect<WakeRuntimePackRecord>(
	wakeRuntimePackObject,
);
const lastWakeJoinObject = z.object({
	created_at: sqliteInt,
	pull_number: sqliteInt,
	repo_id: z.string(),
	repo_name: z.string(),
	repo_owner: z.string(),
	run_url: z.string().nullish(),
	status: z.string(),
});
export const lastWakeJoinSelect =
	asSelect<LastWakeJoinRecord>(lastWakeJoinObject);
const wakeRouteJoinObject = z.object({
	autoAuthorSkip: nullableText,
	autoAuthors: nullableText,
	autoBranchList: nullableText,
	autoBranchSkip: nullableText,
	autoBranches: nullableText,
	autoReviewCadence: nullableText,
	generation: z.number(),
	githubUserId: z.string(),
	homeName: nullableText,
	homeOwner: nullableText,
	homeRepoId: nullableText,
	installationId: nullableText,
	wakeMode: nullableText,
});
export const wakeRouteJoinSelect =
	asSelect<WakeRouteJoinRecord>(wakeRouteJoinObject);

export function parseSelect<T>(
	schema: ZodType<T>,
	value: unknown,
	message: string,
): ParseResult<T> {
	const parsed = schema.safeParse(value);
	if (!parsed.success) {
		return parseInvalid(message);
	}
	return parseOk(parsed.data);
}
