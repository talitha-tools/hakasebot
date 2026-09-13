import { pullNumber } from "@hakasebot/core/domain.ts";
import { dispatchId } from "@hakasebot/core/wake/domain.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import {
	wakeRunRow,
	wakeRunsDb,
} from "@hakasebot/test-kit/helpers/wake-runs-db.ts";
import { describe, expect, test } from "vitest";

import { createHomeStore } from "#/home/store.ts";

const consumer = testRepoRef("talitha-tools/demo", "900001");
const pull = must(pullNumber(4));
const oldDispatch = must(dispatchId("old-dispatch"));
const newDispatch = must(dispatchId("new-dispatch"));
const queuedDispatch = must(dispatchId("queued-dispatch"));
const mentionDispatch = must(dispatchId("mention-dispatch"));

describe("createHomeStore supersede and wake status", () => {
	test("supersedeInFlightReviewWakes atomically marks older review wakes", async () => {
		const store = createHomeStore(
			await wakeRunsDb([
				wakeRunRow({
					consumer,
					createdAt: 100,
					dispatchId: "old-dispatch",
					pullNumber: pull,
					runUrl: "https://github.com/talitha-tools/review-home/actions/runs/9",
					status: "dispatched",
					wakeKey: "talitha-tools/demo#4@aaa",
				}),
				wakeRunRow({
					commentId: 99,
					consumer,
					createdAt: 150,
					dispatchId: "mention-dispatch",
					pullNumber: pull,
					status: "queued",
					wakeKey: "talitha-tools/demo#4!99",
				}),
			]),
		);
		const superseded = await store.supersedeInFlightReviewWakes({
			consumer,
			dispatchId: newDispatch,
			pullNumber: pull,
		});
		expect(superseded).toEqual([
			{
				createdAt: 100,
				dispatchId: oldDispatch,
				runUrl: "https://github.com/talitha-tools/review-home/actions/runs/9",
			},
		]);
		expect(await store.getWakeStatus(oldDispatch)).toBe("superseded");
		expect(await store.getWakeStatus(mentionDispatch)).toBe("queued");
	});

	test("updateWakeIfStatus only updates when the expected status matches", async () => {
		const store = createHomeStore(
			await wakeRunsDb([
				wakeRunRow({
					consumer,
					createdAt: 100,
					dispatchId: "queued-dispatch",
					pullNumber: pull,
					status: "queued",
					wakeKey: "talitha-tools/demo#4@bbb",
				}),
			]),
		);
		const updated = await store.updateWakeIfStatus(queuedDispatch, "queued", {
			status: "dispatched",
		});
		expect(updated).toBe(true);
		expect(await store.getWakeStatus(queuedDispatch)).toBe("dispatched");
		const blocked = await store.updateWakeIfStatus(queuedDispatch, "queued", {
			status: "failed",
		});
		expect(blocked).toBe(false);
	});

	test("finishWakeRun marks queued or dispatched wakes terminal", async () => {
		const store = createHomeStore(
			await wakeRunsDb([
				wakeRunRow({
					consumer,
					createdAt: 100,
					dispatchId: "queued-dispatch",
					pullNumber: pull,
					status: "dispatched",
					wakeKey: "talitha-tools/demo#4",
				}),
			]),
		);
		const updated = await store.finishWakeRun(queuedDispatch, "failed");
		expect(updated).toBe(true);
		expect(await store.getWakeStatus(queuedDispatch)).toBe("failed");
		const blocked = await store.finishWakeRun(queuedDispatch, "failed");
		expect(blocked).toBe(false);
	});
});
