import { createAppDb } from "@hakasebot/core/db/client.ts";
import type { D1DatabaseLike } from "@hakasebot/core/vault/store.ts";
import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { describe, expect, test } from "vitest";

import { createAccountDeletionStore } from "#/web-app/account-deletion-store.ts";

const USER = "delete-user";
const OTHER = "other-user";
const home = testRepoRef("delete-user/review-home", "800001");
const consumer = testRepoRef("delete-user/lab", "800002");
const otherConsumer = testRepoRef("other/lab", "800003");

async function seedDeletionDb(): Promise<D1DatabaseLike> {
	const db = memoryD1();
	await db
		.prepare(
			`INSERT INTO vault_accounts (
        id, github_user_id, engine, label, ciphertext, iv, created_at, updated_at
      ) VALUES
        ('acct-1', ?, 'claude', 'a', 'c', 'i', 1, 1),
        ('acct-2', ?, 'claude', 'a', 'c', 'i', 1, 1)`,
		)
		.bind(USER, OTHER)
		.run();
	await db
		.prepare(
			`INSERT INTO model_slots (
        id, github_user_id, account_id, engine, model, label,
        default_sort_index, created_at, updated_at
      ) VALUES
        ('slot-1', ?, 'acct-1', 'claude', 'opus', 's', 0, 1, 1),
        ('slot-2', ?, 'acct-2', 'claude', 'opus', 's', 0, 1, 1)`,
		)
		.bind(USER, OTHER)
		.run();
	await db
		.prepare(
			`INSERT INTO enabled_repos (
        github_user_id, repo_id, repo_owner, repo_name
      ) VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
		)
		.bind(
			USER,
			consumer.id,
			consumer.owner,
			consumer.name,
			OTHER,
			otherConsumer.id,
			otherConsumer.owner,
			otherConsumer.name,
		)
		.run();
	await db
		.prepare(
			`INSERT INTO repo_routes (
        repo_id, repo_owner, repo_name, github_user_id, generation, claimed_at
      ) VALUES (?, ?, ?, ?, 1, 1), (?, ?, ?, ?, 1, 1)`,
		)
		.bind(
			consumer.id,
			consumer.owner,
			consumer.name,
			USER,
			otherConsumer.id,
			otherConsumer.owner,
			otherConsumer.name,
			OTHER,
		)
		.run();
	await db
		.prepare(
			`INSERT INTO home_repos (
        github_user_id, repo_id, repo_owner, repo_name, created_at
      ) VALUES (?, ?, ?, ?, 1), (?, ?, ?, ?, 1)`,
		)
		.bind(
			USER,
			home.id,
			home.owner,
			home.name,
			OTHER,
			"900099",
			"other",
			"other-home",
		)
		.run();
	await db
		.prepare(
			"INSERT INTO encryption_key_meta (github_user_id, epoch, rotated_at) VALUES (?, 1, 1), (?, 1, 1)",
		)
		.bind(USER, OTHER)
		.run();
	await db
		.prepare(
			"INSERT INTO repo_setting_defaults (github_user_id) VALUES (?), (?)",
		)
		.bind(USER, OTHER)
		.run();
	await db
		.prepare(
			`INSERT INTO repo_model_list_meta (
        github_user_id, repo_id, repo_owner, repo_name, updated_at
      ) VALUES (?, ?, ?, ?, 1), (?, ?, ?, ?, 1)`,
		)
		.bind(
			USER,
			consumer.id,
			consumer.owner,
			consumer.name,
			OTHER,
			otherConsumer.id,
			otherConsumer.owner,
			otherConsumer.name,
		)
		.run();
	await db
		.prepare(
			`INSERT INTO wake_runs (
        wake_key, dispatch_id, github_user_id, consumer_repo_id,
        consumer_owner, consumer_name, pull_number, status, created_at
      ) VALUES
        ('owned', 'd1', ?, ?, ?, ?, 1, 'queued', 1),
        ('legacy', 'd2', NULL, ?, ?, ?, 1, 'queued', 1),
        ('other', 'd3', ?, ?, ?, ?, 1, 'queued', 1)`,
		)
		.bind(
			USER,
			consumer.id,
			consumer.owner,
			consumer.name,
			consumer.id,
			consumer.owner,
			consumer.name,
			OTHER,
			otherConsumer.id,
			otherConsumer.owner,
			otherConsumer.name,
		)
		.run();
	return db;
}

async function userIds(db: D1DatabaseLike, table: string): Promise<string[]> {
	const { results } = await db
		.prepare(`SELECT github_user_id FROM ${table} ORDER BY github_user_id`)
		.all();
	const ids: string[] = [];
	for (const row of results) {
		const id = row["github_user_id"];
		if (typeof id === "string") {
			ids.push(id);
		}
	}
	return ids;
}

describe("createAccountDeletionStore", () => {
	test("previewAccountDeletion counts this User only", async () => {
		const db = await seedDeletionDb();
		const store = createAccountDeletionStore(createAppDb(db));
		const preview = await store.previewAccountDeletion({
			githubUserId: USER,
		});
		expect(preview).toEqual({
			kind: "ok",
			value: {
				enabledRepoCount: 1,
				homeRepo: home,
				modelSlotCount: 1,
				repoClaimCount: 1,
				vaultAccountCount: 1,
				wakeRunCount: 2,
			},
		});
	});

	test("deleteAccount wipes this User and leaves others", async () => {
		const db = await seedDeletionDb();
		const store = createAccountDeletionStore(createAppDb(db));
		const deleted = await store.deleteAccount({ githubUserId: USER });
		expect(deleted).toEqual({ kind: "ok", value: undefined });
		expect(await userIds(db, "vault_accounts")).toEqual([OTHER]);
		expect(await userIds(db, "model_slots")).toEqual([OTHER]);
		expect(await userIds(db, "enabled_repos")).toEqual([OTHER]);
		expect(await userIds(db, "repo_routes")).toEqual([OTHER]);
		expect(await userIds(db, "home_repos")).toEqual([OTHER]);
		expect(await userIds(db, "encryption_key_meta")).toEqual([OTHER]);
		expect(await userIds(db, "repo_setting_defaults")).toEqual([OTHER]);
		expect(await userIds(db, "repo_model_list_meta")).toEqual([OTHER]);
		const wakes = await db
			.prepare(
				"SELECT wake_key, github_user_id, consumer_repo_id FROM wake_runs",
			)
			.all();
		expect(wakes.results).toEqual([
			{
				consumer_repo_id: otherConsumer.id,
				github_user_id: OTHER,
				wake_key: "other",
			},
		]);
	});

	test("deleteAccount is idempotent on an empty User", async () => {
		const db = await seedDeletionDb();
		const store = createAccountDeletionStore(createAppDb(db));
		await store.deleteAccount({ githubUserId: USER });
		const again = await store.deleteAccount({ githubUserId: USER });
		expect(again).toEqual({ kind: "ok", value: undefined });
	});
});
