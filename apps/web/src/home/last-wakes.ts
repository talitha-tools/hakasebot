import type { AppDb } from "@hakasebot/core/db/client.ts";
import {
	enabledRepos,
	repoRoutes,
	wakeRuns,
} from "@hakasebot/core/db/schema.ts";
import { lastWakeJoinSelect, parseSelect } from "@hakasebot/core/db/zod.ts";
import type { ParseResult, PullNumber } from "@hakasebot/core/domain.ts";
import { pullNumber } from "@hakasebot/core/domain.ts";
import { d1Present } from "@hakasebot/core/vault/store.ts";
import type { RunUrl } from "@hakasebot/core/wake/domain.ts";
import { runUrl } from "@hakasebot/core/wake/domain.ts";
import { sql } from "drizzle-orm";

import { storeError } from "./store-shared.ts";

export interface LastWake {
	status: string;
	createdAt: number;
	runUrl: RunUrl | undefined;
	pullNumber: PullNumber;
}

function parseLastWakeRow(args: {
	createdAt: number | string;
	pullNumber: number | string;
	runUrl: string | null | undefined;
	status: string;
}): ParseResult<LastWake> {
	const parsedPullNumber = pullNumber(Number(args.pullNumber));
	if (parsedPullNumber.kind === "invalid") {
		return parsedPullNumber;
	}
	let parsedRunUrl: RunUrl | undefined;
	if (d1Present(args.runUrl)) {
		const parsed = runUrl(args.runUrl);
		if (parsed.kind === "invalid") {
			return parsed;
		}
		parsedRunUrl = parsed.value;
	}
	return {
		kind: "ok",
		value: {
			createdAt: Number(args.createdAt),
			pullNumber: parsedPullNumber.value,
			runUrl: parsedRunUrl,
			status: args.status,
		},
	};
}

function lastWakesByRepo(rows: readonly unknown[]): Record<string, LastWake> {
	const wakes: Record<string, LastWake> = {};
	for (const row of rows) {
		const selected = parseSelect(
			lastWakeJoinSelect,
			row,
			"last wake row is invalid",
		);
		if (selected.kind === "invalid") {
			continue;
		}
		const parsed = parseLastWakeRow({
			createdAt: selected.value.created_at,
			pullNumber: selected.value.pull_number,
			runUrl: selected.value.run_url,
			status: selected.value.status,
		});
		if (parsed.kind === "invalid") {
			continue;
		}
		wakes[selected.value.repo_id] = parsed.value;
	}
	return wakes;
}

export async function listLastWakes(
	db: AppDb,
	args: { githubUserId: string },
): Promise<ParseResult<Record<string, LastWake>>> {
	try {
		const rows = await db.all(sql`
      SELECT ${enabledRepos.repoId} AS repo_id,
             ${enabledRepos.repoOwner} AS repo_owner,
             ${enabledRepos.repoName} AS repo_name,
             w.status AS status,
             w.created_at AS created_at,
             w.run_url AS run_url,
             w.pull_number AS pull_number
      FROM ${enabledRepos}
      INNER JOIN ${repoRoutes}
        ON ${repoRoutes.repoId} = ${enabledRepos.repoId}
       AND ${repoRoutes.githubUserId} = ${enabledRepos.githubUserId}
      INNER JOIN ${wakeRuns} w
        ON w.rowid = (
          SELECT latest.rowid
          FROM ${wakeRuns} latest
          WHERE latest.consumer_repo_id = ${enabledRepos.repoId}
          ORDER BY latest.created_at DESC
          LIMIT 1
        )
      WHERE ${enabledRepos.githubUserId} = ${args.githubUserId}
      ORDER BY ${enabledRepos.repoOwner} ASC, ${enabledRepos.repoName} ASC
    `);
		return { kind: "ok", value: lastWakesByRepo(rows) };
	} catch (error: unknown) {
		return storeError(error);
	}
}
