import { d1Value } from "#/d1.ts";
import type { EngineKind, ParseResult, RepoRef } from "#/domain.ts";
import type {
	AccountId,
	ModelSlotId,
	SealedCredential,
	VaultAccountMeta,
	VaultAccountRow,
} from "#/vault/domain.ts";
import type { ModelSlot, SaveModelSlotArgs } from "#/vault/model-slot.ts";
import type {
	AutoAuthors,
	AutoBranches,
	AutoReviewCadence,
	RepoSettingDefaults,
	WakeMode,
} from "#/wake/domain.ts";

export interface SaveVaultAccountArgs {
	githubUserId: string;
	engine: EngineKind;
	label: string;
	sealed: SealedCredential;
}

export interface SetRepoModelListArgs {
	githubUserId: string;
	repo: RepoRef;
	orderedSlotIds: readonly ModelSlotId[];
}

export interface SetRepoReviewInstructionsArgs {
	githubUserId: string;
	repo: RepoRef;
	prompt?: string;
	ignorePaths?: readonly string[];
}

export interface SetRepoAutoAuthorsArgs {
	githubUserId: string;
	repo: RepoRef;
	autoAuthors: AutoAuthors;
}

export interface SetRepoAutoReviewCadenceArgs {
	githubUserId: string;
	repo: RepoRef;
	autoReviewCadence: AutoReviewCadence;
}

export interface SetRepoAutoBranchesArgs {
	githubUserId: string;
	repo: RepoRef;
	autoBranches: AutoBranches;
}

export interface EnabledRepoRow {
	repo: RepoRef;
	autoReviewCadence: AutoReviewCadence;
	botAt: number | undefined;
	homeAt: number | undefined;
	lastSyncedAt: number | undefined;
	syncedEpoch: number;
	wakeMode: WakeMode;
	autoAuthors: AutoAuthors;
	autoBranches: AutoBranches;
	prompt?: string;
	ignorePaths?: readonly string[];
}

export interface RotateVaultPreview {
	accountCount: number;
	slotCount: number;
	overrideCount: number;
	enabledRepoCount: number;
	repos: readonly RepoRef[];
}

export interface MarkRepoSyncedArgs {
	githubUserId: string;
	repo: RepoRef;
	epoch: number;
}

export interface VaultStore {
	countAccounts: (args: {
		githubUserId: string;
	}) => Promise<ParseResult<number>>;

	readVaultEpoch: (args: {
		githubUserId: string;
	}) => Promise<ParseResult<number | undefined>>;

	getFirstSealedAccount: (args: {
		githubUserId: string;
	}) => Promise<ParseResult<SealedCredential | undefined>>;

	listAccounts: (args: {
		githubUserId: string;
	}) => Promise<ParseResult<VaultAccountMeta[]>>;

	getAccount: (args: {
		githubUserId: string;
		id: AccountId;
	}) => Promise<ParseResult<VaultAccountRow>>;

	saveAccount: (
		args: SaveVaultAccountArgs,
	) => Promise<ParseResult<VaultAccountMeta>>;

	deleteAccount: (args: {
		githubUserId: string;
		id: AccountId;
	}) => Promise<ParseResult<void>>;

	listModelSlots: (args: {
		githubUserId: string;
	}) => Promise<ParseResult<ModelSlot[]>>;

	saveModelSlot: (args: SaveModelSlotArgs) => Promise<ParseResult<ModelSlot>>;

	deleteModelSlot: (args: {
		githubUserId: string;
		id: ModelSlotId;
	}) => Promise<ParseResult<void>>;

	setDefaultSlotOrder: (args: {
		githubUserId: string;
		orderedSlotIds: readonly ModelSlotId[];
	}) => Promise<ParseResult<ModelSlot[]>>;

	listSlotsForRepo: (args: {
		githubUserId: string;
		repo: RepoRef;
	}) => Promise<ParseResult<ModelSlot[]>>;

	setRepoModelList: (
		args: SetRepoModelListArgs,
	) => Promise<ParseResult<ModelSlot[]>>;

	clearRepoModelList: (args: {
		githubUserId: string;
		repo: RepoRef;
	}) => Promise<ParseResult<ModelSlot[]>>;

	setRepoReviewInstructions: (
		args: SetRepoReviewInstructionsArgs,
	) => Promise<ParseResult<EnabledRepoRow>>;

	listEnabledRepos: (args: {
		githubUserId: string;
	}) => Promise<ParseResult<EnabledRepoRow[]>>;

	enableRepo: (args: {
		githubUserId: string;
		repo: RepoRef;
	}) => Promise<ParseResult<EnabledRepoRow>>;

	getRepoSettingDefaults: (args: {
		githubUserId: string;
	}) => Promise<ParseResult<RepoSettingDefaults>>;

	setRepoSettingDefaults: (args: {
		githubUserId: string;
		defaults: RepoSettingDefaults;
	}) => Promise<ParseResult<RepoSettingDefaults>>;

	disableRepo: (args: {
		githubUserId: string;
		repo: RepoRef;
	}) => Promise<ParseResult<void>>;

	setRepoAutoReviewCadence: (
		args: SetRepoAutoReviewCadenceArgs,
	) => Promise<ParseResult<EnabledRepoRow>>;

	setRepoWakeMode: (args: {
		githubUserId: string;
		repo: RepoRef;
		wakeMode: WakeMode;
	}) => Promise<ParseResult<EnabledRepoRow>>;

	setRepoAutoAuthors: (
		args: SetRepoAutoAuthorsArgs,
	) => Promise<ParseResult<EnabledRepoRow>>;

	setRepoAutoBranches: (
		args: SetRepoAutoBranchesArgs,
	) => Promise<ParseResult<EnabledRepoRow>>;

	markRepoBotAt: (args: {
		githubUserId: string;
		repo: RepoRef;
		at: number;
	}) => Promise<ParseResult<EnabledRepoRow>>;

	markHomeDispatcherAt: (args: {
		githubUserId: string;
		repo: RepoRef;
		at: number;
	}) => Promise<ParseResult<EnabledRepoRow>>;

	markRepoSynced: (
		args: MarkRepoSyncedArgs,
	) => Promise<ParseResult<EnabledRepoRow>>;

	previewRotateVault: (args: {
		githubUserId: string;
	}) => Promise<ParseResult<RotateVaultPreview>>;

	rotateVault: (args: {
		githubUserId: string;
	}) => Promise<ParseResult<{ epoch: number }>>;
}

export function d1Present<T>(value: T | null | undefined): value is T {
	return d1Value(value) !== undefined;
}

export {
	type D1DatabaseLike,
	type D1PreparedStatement,
	isD1Database,
} from "#/db/types.ts";
