import { sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import {
	check,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

import { EFFORTS, ENGINE_KINDS } from "#/domain.ts";
import { WAKE_OUTCOME_KINDS } from "#/wake/domain.ts";

function sqliteTextIn(column: string, values: readonly string[]) {
	return sql.raw(
		`${column} IN (${values.map((value) => `'${value}'`).join(", ")})`,
	);
}

const ENGINE_IN = sqliteTextIn("engine", ENGINE_KINDS);
const EFFORT_IN = sqliteTextIn("effort", EFFORTS);

export const vaultAccounts = sqliteTable(
	"vault_accounts",
	{
		id: text("id").primaryKey(),
		githubUserId: text("github_user_id").notNull(),
		engine: text("engine", { enum: ENGINE_KINDS }).notNull(),
		label: text("label").notNull(),
		ciphertext: text("ciphertext").notNull(),
		iv: text("iv").notNull(),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		check("vault_accounts_engine", ENGINE_IN),
		index("vault_accounts_user_engine").on(table.githubUserId, table.engine),
	],
);

export const encryptionKeyMeta = sqliteTable("encryption_key_meta", {
	githubUserId: text("github_user_id").primaryKey(),
	epoch: integer("epoch").notNull().default(1),
	rotatedAt: integer("rotated_at").notNull(),
});

export const modelSlots = sqliteTable(
	"model_slots",
	{
		id: text("id").primaryKey(),
		githubUserId: text("github_user_id").notNull(),
		accountId: text("account_id")
			.notNull()
			.references(() => vaultAccounts.id, { onDelete: "cascade" }),
		engine: text("engine", { enum: ENGINE_KINDS }).notNull(),
		model: text("model").notNull(),
		effort: text("effort", { enum: EFFORTS }),
		fast: integer("fast").notNull().default(0),
		label: text("label").notNull(),
		defaultSortIndex: integer("default_sort_index").notNull(),
		createdAt: integer("created_at").notNull(),
		updatedAt: integer("updated_at").notNull(),
		similarModel: integer("similar_model").notNull().default(1),
	},
	(table) => [
		check("model_slots_engine", ENGINE_IN),
		check("model_slots_effort", EFFORT_IN),
		check("model_slots_similar_model", sql`similar_model IN (0, 1)`),
		index("model_slots_user").on(table.githubUserId, table.defaultSortIndex),
	],
);

export const repoModelList = sqliteTable(
	"repo_model_list",
	{
		githubUserId: text("github_user_id").notNull(),
		repoId: text("repo_id").notNull(),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		slotId: text("slot_id")
			.notNull()
			.references(() => modelSlots.id, { onDelete: "cascade" }),
		sortIndex: integer("sort_index").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [
		primaryKey({
			columns: [table.githubUserId, table.repoId, table.slotId],
		}),
		index("repo_model_list_repo").on(
			table.githubUserId,
			table.repoId,
			table.sortIndex,
		),
	],
);

export const repoModelListMeta = sqliteTable(
	"repo_model_list_meta",
	{
		githubUserId: text("github_user_id").notNull(),
		repoId: text("repo_id").notNull(),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		updatedAt: integer("updated_at").notNull(),
	},
	(table) => [primaryKey({ columns: [table.githubUserId, table.repoId] })],
);

export const enabledRepos = sqliteTable(
	"enabled_repos",
	{
		githubUserId: text("github_user_id").notNull(),
		repoId: text("repo_id").notNull(),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		botAt: integer("bot_at"),
		homeAt: integer("home_at"),
		lastSyncedAt: integer("last_synced_at"),
		syncedEpoch: integer("synced_epoch").notNull().default(0),
		wakeMode: text("wake_mode").notNull().default("auto"),
		reviewPrompt: text("review_prompt"),
		ignorePaths: text("ignore_paths"),
		autoAuthors: text("auto_authors").notNull().default("you"),
		autoAuthorSkip: text("auto_author_skip"),
		autoBranches: text("auto_branches").notNull().default("default"),
		autoBranchList: text("auto_branch_list"),
		autoBranchSkip: text("auto_branch_skip"),
		autoReviewCadence: text("auto_review_cadence")
			.notNull()
			.default("every-push"),
	},
	(table) => [
		primaryKey({ columns: [table.githubUserId, table.repoId] }),
		index("enabled_repos_repo_id").on(table.repoId),
	],
);

export const repoSettingDefaults = sqliteTable("repo_setting_defaults", {
	githubUserId: text("github_user_id").primaryKey(),
	wakeMode: text("wake_mode").notNull().default("auto"),
	autoAuthors: text("auto_authors").notNull().default("you"),
	autoBranches: text("auto_branches").notNull().default("default"),
	autoReviewCadence: text("auto_review_cadence")
		.notNull()
		.default("every-push"),
});

export const homeRepos = sqliteTable("home_repos", {
	githubUserId: text("github_user_id").primaryKey(),
	repoId: text("repo_id").notNull(),
	repoOwner: text("repo_owner").notNull(),
	repoName: text("repo_name").notNull(),
	installationId: text("installation_id"),
	secretsEpoch: integer("secrets_epoch").notNull().default(0),
	secretsSyncedAt: integer("secrets_synced_at"),
	createdAt: integer("created_at").notNull(),
});

export const repoRoutes = sqliteTable(
	"repo_routes",
	{
		repoId: text("repo_id").primaryKey(),
		repoOwner: text("repo_owner").notNull(),
		repoName: text("repo_name").notNull(),
		githubUserId: text("github_user_id").notNull(),
		generation: integer("generation").notNull(),
		claimedAt: integer("claimed_at").notNull(),
		botInstallationId: text("bot_installation_id"),
	},
	(table) => [
		index("repo_routes_bot_installation").on(table.botInstallationId),
	],
);

export const wakeRuns = sqliteTable(
	"wake_runs",
	{
		wakeKey: text("wake_key").primaryKey(),
		dispatchId: text("dispatch_id").notNull(),
		githubUserId: text("github_user_id"),
		consumerRepoId: text("consumer_repo_id").notNull(),
		consumerOwner: text("consumer_owner").notNull(),
		consumerName: text("consumer_name").notNull(),
		pullNumber: integer("pull_number").notNull(),
		headSha: text("head_sha"),
		commentId: integer("comment_id"),
		progressCommentId: integer("progress_comment_id"),
		runUrl: text("run_url"),
		status: text("status").notNull(),
		createdAt: integer("created_at").notNull(),
	},
	(table) => [
		index("wake_runs_dispatch_id").on(table.dispatchId),
		index("wake_runs_consumer_created").on(
			table.consumerRepoId,
			sql`${table.createdAt} DESC`,
		),
	],
);

export const webhookReceipts = sqliteTable(
	"webhook_receipts",
	{
		id: integer("id").primaryKey(),
		receivedAt: integer("received_at").notNull(),
		eventName: text("event_name").notNull(),
		outcome: text("outcome", { enum: WAKE_OUTCOME_KINDS }).notNull(),
	},
	() => [check("webhook_receipts_singleton", sql`id = 1`)],
);

export const schema = {
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
};

export type VaultAccountRecord = InferSelectModel<typeof vaultAccounts>;
export type ModelSlotRecord = InferSelectModel<typeof modelSlots>;
export type EnabledRepoRecord = InferSelectModel<typeof enabledRepos>;
export type HomeRepoRecord = InferSelectModel<typeof homeRepos>;
export type RepoRouteRecord = InferSelectModel<typeof repoRoutes>;
export type WakeRunRecord = InferSelectModel<typeof wakeRuns>;
export type WebhookReceiptRecord = InferSelectModel<typeof webhookReceipts>;
export type EncryptionKeyMetaRecord = InferSelectModel<
	typeof encryptionKeyMeta
>;
export type RepoModelListRecord = InferSelectModel<typeof repoModelList>;
export type RepoModelListMetaRecord = InferSelectModel<
	typeof repoModelListMeta
>;
export type RepoSettingDefaultsRecord = InferSelectModel<
	typeof repoSettingDefaults
>;
