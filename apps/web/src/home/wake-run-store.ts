import { d1Bindable } from "@hakasebot/core/d1.ts";
import type { AppDb } from "@hakasebot/core/db/client.ts";
import { firstRow } from "@hakasebot/core/db/row.ts";
import { repoRoutes, wakeRuns } from "@hakasebot/core/db/schema.ts";
import {
	parseSelect,
	wakeAutoPrSelect,
	wakeDispatchSelect,
	wakeRuntimePackSelect,
	wakeStatusSelect,
} from "@hakasebot/core/db/zod.ts";
import type { PullNumber, RepoRef } from "@hakasebot/core/domain.ts";
import { brandString } from "@hakasebot/core/domain.ts";
import { parseRepoDbRow } from "@hakasebot/core/vault/store/rows.ts";
import type { TerminalWakeStatus } from "@hakasebot/core/wake-status.ts";
import type { DispatchId } from "@hakasebot/core/wake/domain.ts";
import { dispatchId, parseWakeStatus } from "@hakasebot/core/wake/domain.ts";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import type { WakeStore } from "#/wake/deps.server.ts";

import { parseSupersededWake } from "./wake-run-row.ts";
import type { SupersededWakeRow } from "./wake-run-row.ts";

type InsertWakeRow = Parameters<WakeStore["insertWake"]>[0];
type WakePatch = Parameters<WakeStore["updateWake"]>[1];

export async function findAutoWakeForPr(
	db: AppDb,
	args: { consumer: RepoRef; pullNumber: PullNumber },
): ReturnType<WakeStore["findAutoWakeForPr"]> {
	const pull = Number(args.pullNumber);
	const rows = await db
		.select({
			dispatchId: wakeRuns.dispatchId,
			status: wakeRuns.status,
			wakeKey: wakeRuns.wakeKey,
		})
		.from(wakeRuns)
		.where(
			and(
				eq(wakeRuns.consumerRepoId, args.consumer.id),
				eq(wakeRuns.pullNumber, pull),
				isNull(wakeRuns.commentId),
			),
		)
		.orderBy(desc(wakeRuns.createdAt))
		.limit(1);
	const row = firstRow(rows);
	if (row === undefined) {
		return;
	}
	const selected = parseSelect(
		wakeAutoPrSelect,
		row,
		"wake run row is invalid",
	);
	if (selected.kind === "invalid") {
		return;
	}
	const parsedDispatchId = dispatchId(selected.value.dispatchId);
	if (parsedDispatchId.kind === "invalid") {
		return;
	}
	return {
		dispatchId: parsedDispatchId.value,
		status: parseWakeStatus(selected.value.status),
		wakeKey: brandString(selected.value.wakeKey, "WakeKey"),
	};
}

export async function finishWakeRun(
	db: AppDb,
	dispatchIdValue: DispatchId,
	terminalStatus: TerminalWakeStatus,
): Promise<boolean> {
	const rows = await db
		.update(wakeRuns)
		.set({ status: terminalStatus })
		.where(
			and(
				eq(wakeRuns.dispatchId, dispatchIdValue),
				inArray(wakeRuns.status, ["queued", "dispatched"]),
			),
		)
		.returning({ dispatchId: wakeRuns.dispatchId });
	return rows.length > 0;
}

export async function findWakeForRuntimePack(
	db: AppDb,
	dispatchIdValue: DispatchId,
): Promise<{ consumer: RepoRef; githubUserId: string } | undefined> {
	const rows = await db
		.select({
			consumerName: wakeRuns.consumerName,
			consumerOwner: wakeRuns.consumerOwner,
			consumerRepoId: wakeRuns.consumerRepoId,
			githubUserId: repoRoutes.githubUserId,
		})
		.from(wakeRuns)
		.innerJoin(repoRoutes, eq(repoRoutes.repoId, wakeRuns.consumerRepoId))
		.where(eq(wakeRuns.dispatchId, dispatchIdValue))
		.limit(1);
	const row = firstRow(rows);
	if (row === undefined) {
		return;
	}
	const selected = parseSelect(
		wakeRuntimePackSelect,
		row,
		"wake run row is invalid",
	);
	if (selected.kind === "invalid") {
		return;
	}
	const consumer = parseRepoDbRow({
		repoId: selected.value.consumerRepoId,
		repoName: selected.value.consumerName,
		repoOwner: selected.value.consumerOwner,
	});
	if (consumer.kind === "invalid") {
		return;
	}
	return {
		consumer: consumer.value,
		githubUserId: selected.value.githubUserId,
	};
}

export async function getWakeStatus(
	db: AppDb,
	dispatchIdValue: DispatchId,
): ReturnType<WakeStore["getWakeStatus"]> {
	const rows = await db
		.select({ status: wakeRuns.status })
		.from(wakeRuns)
		.where(eq(wakeRuns.dispatchId, dispatchIdValue))
		.limit(1);
	const row = firstRow(rows);
	if (row === undefined) {
		return;
	}
	const selected = parseSelect(
		wakeStatusSelect,
		row,
		"wake run row is invalid",
	);
	if (selected.kind === "invalid") {
		return;
	}
	return parseWakeStatus(selected.value.status);
}

export async function supersedeInFlightReviewWakes(
	db: AppDb,
	args: { consumer: RepoRef; dispatchId: DispatchId; pullNumber: PullNumber },
): Promise<SupersededWakeRow[]> {
	const pull = Number(args.pullNumber);
	const inFlight = ["queued", "dispatched"] as const;
	const rows = await db
		.update(wakeRuns)
		.set({ status: "superseded" })
		.where(
			and(
				eq(wakeRuns.consumerRepoId, args.consumer.id),
				eq(wakeRuns.pullNumber, pull),
				ne(wakeRuns.dispatchId, args.dispatchId),
				isNull(wakeRuns.commentId),
				inArray(wakeRuns.status, inFlight),
			),
		)
		.returning({
			createdAt: wakeRuns.createdAt,
			dispatchId: wakeRuns.dispatchId,
			runUrl: wakeRuns.runUrl,
		});
	const superseded: SupersededWakeRow[] = [];
	for (const row of rows) {
		const parsed = parseSupersededWake(row);
		if (parsed === undefined) {
			continue;
		}
		superseded.push(parsed);
	}
	return superseded;
}

export async function insertWake(
	db: AppDb,
	row: InsertWakeRow,
): Promise<"inserted" | "duplicate"> {
	const now = Date.now();
	if (row.replace) {
		await db.delete(wakeRuns).where(eq(wakeRuns.wakeKey, row.key));
	}
	await db
		.insert(wakeRuns)
		.values({
			commentId: d1Bindable(
				row.commentId === undefined ? undefined : Number(row.commentId),
			),
			consumerName: row.consumer.name,
			consumerOwner: row.consumer.owner,
			consumerRepoId: row.consumer.id,
			createdAt: now,
			dispatchId: row.dispatchId,
			githubUserId: d1Bindable(row.githubUserId),
			headSha: d1Bindable(row.headSha),
			pullNumber: Number(row.pullNumber),
			status: "queued",
			wakeKey: row.key,
		})
		.onConflictDoNothing();
	const existing = await db
		.select({ dispatchId: wakeRuns.dispatchId })
		.from(wakeRuns)
		.where(eq(wakeRuns.wakeKey, row.key))
		.limit(1);
	const found = firstRow(existing);
	if (found === undefined) {
		return "duplicate";
	}
	const selected = parseSelect(
		wakeDispatchSelect,
		found,
		"wake run row is invalid",
	);
	if (
		selected.kind === "invalid" ||
		selected.value.dispatchId !== row.dispatchId
	) {
		return "duplicate";
	}
	return "inserted";
}

function coalescePatch(patch: WakePatch) {
	return {
		progressCommentId:
			patch.progressCommentId === undefined
				? sql`${wakeRuns.progressCommentId}`
				: Number(patch.progressCommentId),
		runUrl: patch.runUrl ?? sql`${wakeRuns.runUrl}`,
		status: patch.status,
	};
}

export async function updateWake(
	db: AppDb,
	dispatchIdValue: DispatchId,
	patch: WakePatch,
): Promise<void> {
	await db
		.update(wakeRuns)
		.set(coalescePatch(patch))
		.where(eq(wakeRuns.dispatchId, dispatchIdValue));
}

export async function updateWakeIfStatus(
	db: AppDb,
	dispatchIdValue: DispatchId,
	expectedStatus: string,
	patch: WakePatch,
): Promise<boolean> {
	const rows = await db
		.update(wakeRuns)
		.set(coalescePatch(patch))
		.where(
			and(
				eq(wakeRuns.dispatchId, dispatchIdValue),
				eq(wakeRuns.status, expectedStatus),
			),
		)
		.returning({ dispatchId: wakeRuns.dispatchId });
	return rows.length > 0;
}
