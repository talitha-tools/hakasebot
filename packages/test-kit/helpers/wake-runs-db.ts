import { d1Bindable } from "@hakasebot/core/d1.ts";
import type { PullNumber, RepoRef } from "@hakasebot/core/domain.ts";
import type { D1DatabaseLike } from "@hakasebot/core/vault/store.ts";

import { memoryD1 } from "./d1.ts";

interface WakeRunRow {
	commentId: number | undefined;
	consumer: RepoRef;
	createdAt: number;
	dispatchId: string;
	headSha: string | undefined;
	pullNumber: number;
	runUrl: string | undefined;
	status: string;
	wakeKey: string;
}

async function seedWakeRuns(
	db: D1DatabaseLike,
	rows: readonly WakeRunRow[],
): Promise<void> {
	for (const row of rows) {
		// oxlint-disable-next-line eslint/no-await-in-loop -- seed rows in order for tests
		await db
			.prepare(
				`INSERT INTO wake_runs (
          wake_key, dispatch_id, consumer_repo_id, consumer_owner, consumer_name,
          pull_number, head_sha, comment_id, run_url, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(
				row.wakeKey,
				row.dispatchId,
				row.consumer.id,
				row.consumer.owner,
				row.consumer.name,
				row.pullNumber,
				d1Bindable(row.headSha),
				d1Bindable(row.commentId),
				d1Bindable(row.runUrl),
				row.status,
				row.createdAt,
			)
			.run();
	}
}

function wakeRunRow(args: {
	commentId?: number;
	consumer: RepoRef;
	createdAt: number;
	dispatchId: string;
	pullNumber: PullNumber;
	runUrl?: string;
	status: string;
	wakeKey: string;
}): WakeRunRow {
	return {
		commentId: args.commentId,
		consumer: args.consumer,
		createdAt: args.createdAt,
		dispatchId: args.dispatchId,
		headSha: undefined,
		pullNumber: Number(args.pullNumber),
		runUrl: args.runUrl,
		status: args.status,
		wakeKey: args.wakeKey,
	};
}

async function wakeRunsDb(rows: WakeRunRow[]): Promise<D1DatabaseLike> {
	const db = memoryD1();
	await seedWakeRuns(db, rows);
	return db;
}

export type { WakeRunRow };
export { seedWakeRuns, wakeRunRow, wakeRunsDb };
