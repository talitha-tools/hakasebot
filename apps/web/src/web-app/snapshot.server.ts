import { createAppDb } from "@hakasebot/core/db/client.ts";
import { firstRow } from "@hakasebot/core/db/row.ts";
import { enabledRepos } from "@hakasebot/core/db/schema.ts";
import {
	enabledRepoSyncedSelect,
	parseSelect,
} from "@hakasebot/core/db/zod.ts";
import type { ParseResult } from "@hakasebot/core/domain.ts";
import { and, eq, isNotNull } from "drizzle-orm";

import { createHomeStore, d1FromWorkerEnv } from "#/home/store.ts";
import { readVaultGateSnapshot } from "#/vault/gate.server.ts";

import type { WebAppSnapshot, HomeRepoSnapshot } from "./domain.ts";

async function queryHasSyncedRepo(args: {
	githubUserId: string;
}): Promise<boolean> {
	const d1 = await d1FromWorkerEnv();
	if (d1 === undefined) {
		return false;
	}
	try {
		const rows = await createAppDb(d1)
			.select({ lastSyncedAt: enabledRepos.lastSyncedAt })
			.from(enabledRepos)
			.where(
				and(
					eq(enabledRepos.githubUserId, args.githubUserId),
					isNotNull(enabledRepos.lastSyncedAt),
				),
			)
			.limit(1);
		const row = firstRow(rows);
		if (row === undefined) {
			return false;
		}
		const selected = parseSelect(
			enabledRepoSyncedSelect,
			row,
			"enabled repo row is invalid",
		);
		return selected.kind === "ok";
	} catch {
		return false;
	}
}

async function queryHomeRepo(args: {
	githubUserId: string;
}): Promise<HomeRepoSnapshot | undefined> {
	const db = await d1FromWorkerEnv();
	if (db === undefined) {
		return undefined;
	}
	const home = await createHomeStore(db).getHomeRepo(args.githubUserId);
	if (home.kind === "invalid" || home.value === undefined) {
		return undefined;
	}
	return {
		installationReady: home.value.installationId !== undefined,
		repo: home.value.repo,
		secretsSyncedAt: home.value.secretsSyncedAt,
	};
}

export async function readWebAppSnapshot(args: {
	cookieHeader: string;
}): Promise<ParseResult<WebAppSnapshot>> {
	const gate = await readVaultGateSnapshot({
		cookieHeader: args.cookieHeader,
	});
	if (gate.kind === "invalid") {
		return gate;
	}

	const hasSyncedRepo = await queryHasSyncedRepo({
		githubUserId: gate.value.githubUserId,
	});
	const home = await queryHomeRepo({
		githubUserId: gate.value.githubUserId,
	});

	return {
		kind: "ok",
		value: {
			githubUserId: gate.value.githubUserId,
			hasSyncedRepo,
			home,
		},
	};
}
