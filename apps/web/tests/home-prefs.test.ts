import {
	engineKind,
	githubAppSlug,
	modelName,
} from "@hakasebot/core/domain.ts";
import {
	parseHomePrefs,
	serializeHomePrefs,
	slotsForConsumer,
} from "@hakasebot/core/home/prefs.ts";
import { accountId, modelSlotId } from "@hakasebot/core/vault/domain.ts";
import { must } from "@hakasebot/test-kit/helpers/job.ts";
import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { expect, test } from "vitest";

import { homeRepoName } from "#/home/name.ts";

function testAppSlug(value: string) {
	return must(githubAppSlug(value));
}

function testRepo(value: string, id?: number | string) {
	return testRepoRef(value, id);
}

test("homeRepoName uses the app slug suffix", () => {
	expect(homeRepoName(undefined)).toBe("review-home");
	expect(homeRepoName(testAppSlug("bot-app"))).toBe("bot-app-home");
});

test("prefs round-trip and filter slots per consumer", () => {
	const repo = testRepoRef("talitha-tools/demo", "900001");
	const slot = {
		accountId: must(accountId("acc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")),
		createdAt: 1,
		defaultSortIndex: 0,
		engine: must(engineKind("claude")),
		fast: false,
		id: must(modelSlotId("slot_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")),
		label: "opus",
		model: must(modelName("opus")),
		similarModel: true,
	};
	const prefs = {
		repos: [
			{
				repo,
				slotIds: [slot.id],
				prompt: "focus on correctness",
				ignorePaths: ["CHANGELOG.md", "docs/generated/**"],
			},
		],
		slots: [slot],
		version: 1 as const,
	};
	const parsed = parseHomePrefs(serializeHomePrefs(prefs));
	expect(parsed.kind).toBe("ok");
	if (parsed.kind !== "ok") {
		return;
	}
	expect(parsed.value.repos[0]).toEqual(prefs.repos[0]);
	expect(slotsForConsumer({ consumer: repo, prefs: parsed.value })).toEqual([
		slot,
	]);
	expect(
		slotsForConsumer({
			consumer: testRepo("talitha-tools/other", "900002"),
			prefs: parsed.value,
		}),
	).toEqual([]);
});

test("prefs version 1 accepts nested repo rows without review instructions", () => {
	const parsed = parseHomePrefs(
		JSON.stringify({
			repos: [
				{
					repo: {
						id: "900001",
						name: "demo",
						owner: "talitha-tools",
					},
				},
			],
			slots: [],
			version: 1,
		}),
	);
	expect(parsed).toEqual({
		kind: "ok",
		value: {
			repos: [
				{
					repo: testRepo("talitha-tools/demo", "900001"),
					slotIds: undefined,
				},
			],
			slots: [],
			version: 1,
		},
	});
});

test("prefs slots without similarModel default on", () => {
	const parsed = parseHomePrefs(
		JSON.stringify({
			repos: [
				{
					repo: {
						id: "900001",
						name: "demo",
						owner: "talitha-tools",
					},
					slotIds: ["slot_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"],
				},
			],
			slots: [
				{
					accountId: "acc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					createdAt: 1,
					defaultSortIndex: 0,
					engine: "claude",
					fast: false,
					id: "slot_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					label: "opus",
					model: "opus",
				},
			],
			version: 1,
		}),
	);
	expect(parsed.kind).toBe("ok");
	if (parsed.kind !== "ok") {
		return;
	}
	expect(parsed.value.slots[0]?.similarModel).toBe(true);
});

test("prefs keep padded slot labels and reject blank ones", () => {
	const padded = parseHomePrefs(
		JSON.stringify({
			repos: [],
			slots: [
				{
					accountId: "acc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					createdAt: 1,
					defaultSortIndex: 0,
					engine: "claude",
					fast: false,
					id: "slot_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					label: "  opus  ",
					model: "opus",
				},
			],
			version: 1,
		}),
	);
	expect(padded.kind).toBe("ok");
	if (padded.kind === "ok") {
		expect(padded.value.slots[0]?.label).toBe("  opus  ");
	}
	const blank = parseHomePrefs(
		JSON.stringify({
			repos: [],
			slots: [
				{
					accountId: "acc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					createdAt: 1,
					defaultSortIndex: 0,
					engine: "claude",
					fast: false,
					id: "slot_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
					label: "   ",
					model: "opus",
				},
			],
			version: 1,
		}),
	);
	expect(blank).toEqual({
		kind: "invalid",
		message: "runtime pack prefs slot label is empty",
	});
});

test("prefs reject flat repo rows", () => {
	const parsed = parseHomePrefs(
		JSON.stringify({
			repos: [
				{
					id: "900001",
					name: "demo",
					owner: "talitha-tools",
				},
			],
			slots: [],
			version: 1,
		}),
	);
	expect(parsed).toEqual({
		kind: "invalid",
		message: "runtime pack prefs repo row is invalid",
	});
});
