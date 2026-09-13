import {
	brandString,
	githubAppInstallationId,
	pullNumber,
} from "@hakasebot/core/domain.ts";
import { dispatchId } from "@hakasebot/core/wake/domain.ts";
import { memoryD1 } from "@hakasebot/test-kit/helpers/d1.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { describe, expect, test } from "vitest";

import { createHomeStore } from "#/home/store.ts";
import type { WakeHome } from "#/wake/webhook.server.ts";

const consumer = testRepoRef("talitha-tools/demo", "900001");
const homeRepo = testRepoRef("talitha-tools/review-home", "900099");
const USER = "42";

describe("createHomeStore insertWake github_user_id", () => {
	test("persists github_user_id on insert", async () => {
		const db = memoryD1();
		const store = createHomeStore(db);
		const home: WakeHome = {
			installationId: must(githubAppInstallationId("9")),
			repo: homeRepo,
		};
		const key = "talitha-tools/demo#1@aaa";
		const inserted = await store.insertWake({
			commentId: undefined,
			consumer,
			dispatchId: must(dispatchId("dispatch-1")),
			githubUserId: USER,
			headSha: undefined,
			home,
			key: brandString(key, "WakeKey"),
			plan: {
				kind: "review",
				pullNumber: must(pullNumber(1)),
			},
			pullNumber: must(pullNumber(1)),
		});
		expect(inserted).toBe("inserted");
		const row = await db
			.prepare("SELECT github_user_id FROM wake_runs WHERE wake_key = ?")
			.bind(key)
			.first<{ github_user_id: string }>();
		expect(row?.github_user_id).toBe(USER);
	});
});
