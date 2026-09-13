import {
	defaultAutoBranches,
	defaultAutoReviewCadence,
} from "@hakasebot/core/wake/domain.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { describe, expect, test } from "vitest";

import {
	applyRepoInstallEvent,
	initialInstallStage,
	machineStageToInstallStep,
	reduceRepoInstall,
	repoNeedsResync,
} from "#/web-app/machine.ts";

const repo = testRepoRef("talitha-tools/hakasebot", "100001");

describe("reduceRepoInstall", () => {
	test("begin_install starts at bot when bot_at is missing", () => {
		const reduced = reduceRepoInstall({
			command: { kind: "begin_install", repo },
			row: {
				homeAt: undefined,
				lastSyncedAt: undefined,
				botAt: undefined,
				repo,
				syncedEpoch: 0,
				wakeMode: "auto",
				autoAuthors: { scope: "you", skipLogins: [] },
				autoReviewCadence: defaultAutoReviewCadence(),
				autoBranches: defaultAutoBranches(),
			},
			state: { kind: "idle" },
		});
		expect(reduced).toEqual({
			effects: [{ kind: "run_bot", repo }],
			kind: "ok",
			state: { kind: "running", repo, stage: "bot" },
		});
	});

	test("begin_install starts at secret_sync when bot already stands", () => {
		const reduced = reduceRepoInstall({
			command: { kind: "begin_install", repo },
			row: {
				homeAt: 1,
				lastSyncedAt: undefined,
				botAt: 1,
				repo,
				syncedEpoch: 0,
				wakeMode: "auto",
				autoAuthors: { scope: "you", skipLogins: [] },
				autoReviewCadence: defaultAutoReviewCadence(),
				autoBranches: defaultAutoBranches(),
			},
			state: { kind: "idle" },
		});
		expect(reduced).toEqual({
			effects: [{ kind: "run_secret_sync", repo }],
			kind: "ok",
			state: { kind: "running", repo, stage: "secret_sync" },
		});
	});

	test("begin_resync enters secret sync when bot stands", () => {
		const reduced = reduceRepoInstall({
			command: { kind: "begin_resync", repo },
			row: {
				homeAt: 1,
				lastSyncedAt: 1,
				botAt: 1,
				repo,
				syncedEpoch: 1,
				wakeMode: "auto",
				autoAuthors: { scope: "you", skipLogins: [] },
				autoReviewCadence: defaultAutoReviewCadence(),
				autoBranches: defaultAutoBranches(),
			},
			state: { kind: "idle" },
		});
		expect(reduced).toEqual({
			effects: [{ kind: "run_secret_sync", repo }],
			kind: "ok",
			state: { kind: "running", repo, stage: "secret_sync" },
		});
	});

	test("failed secret_sync retry re-enters that stage", () => {
		const reduced = reduceRepoInstall({
			command: { kind: "retry" },
			state: {
				kind: "failed",
				message: "nope",
				repo,
				stage: "secret_sync",
			},
		});
		expect(reduced).toEqual({
			effects: [{ kind: "run_secret_sync", repo }],
			kind: "ok",
			state: { kind: "running", repo, stage: "secret_sync" },
		});
	});
});

describe("applyRepoInstallEvent", () => {
	test("bot ok advances to secret sync", () => {
		const applied = applyRepoInstallEvent({
			event: { kind: "stage_ok", stage: "bot" },
			state: { kind: "running", repo, stage: "bot" },
		});
		expect(applied).toEqual({
			effects: [{ kind: "run_secret_sync", repo }],
			kind: "ok",
			state: { kind: "running", repo, stage: "secret_sync" },
		});
	});
});

describe("machineStageToInstallStep", () => {
	test("maps bot and secret_sync onto the two install steps", () => {
		expect(machineStageToInstallStep("bot")).toBe("bot");
		expect(machineStageToInstallStep("secret_sync")).toBe("sync");
	});
});

describe("initialInstallStage", () => {
	test("skips completed bot", () => {
		expect(
			initialInstallStage({
				botAt: 1,
			}),
		).toBe("secret_sync");
	});
});

describe("repoNeedsResync", () => {
	test("is true when synced epoch trails vault epoch", () => {
		expect(repoNeedsResync({ syncedEpoch: 1 }, 2)).toBe(true);
		expect(repoNeedsResync({ syncedEpoch: 2 }, 2)).toBe(false);
	});
});
