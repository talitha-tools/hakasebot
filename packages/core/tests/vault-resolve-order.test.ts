import { testRepoRef } from "@hakasebot/test-kit/helpers/repo.ts";
import { describe, expect, test } from "vitest";

import { modelName } from "#/domain.ts";
import { newAccountId, newModelSlotId } from "#/vault/domain.ts";
import type { ModelSlot } from "#/vault/model-slot.ts";
import { mergeSlotOrder, slotsForRepoView } from "#/vault/resolve-order.ts";

function testSlot(id: ReturnType<typeof newModelSlotId>): ModelSlot {
	const parsedModel = modelName("claude-sonnet-5");
	if (parsedModel.kind === "invalid") {
		throw new Error(parsedModel.message);
	}
	return {
		accountId: newAccountId(),
		createdAt: 1,
		defaultSortIndex: 0,
		engine: "claude",
		fast: false,
		id,
		label: id,
		model: parsedModel.value,
		similarModel: true,
	};
}

describe("mergeSlotOrder", () => {
	test("uses default order when repo has no overrides", () => {
		const first = newModelSlotId();
		const second = newModelSlotId();
		const order = mergeSlotOrder({
			slots: [
				{ defaultSortIndex: 1, id: first },
				{ defaultSortIndex: 0, id: second },
			],
		});
		expect(order).toEqual([second, first]);
	});

	test("repo override is an allowlist in repo order", () => {
		const first = newModelSlotId();
		const second = newModelSlotId();
		const third = newModelSlotId();
		const order = mergeSlotOrder({
			repoOverrides: [
				{ slotId: second, sortIndex: 0 },
				{ slotId: first, sortIndex: 1 },
			],
			slots: [
				{ defaultSortIndex: 0, id: first },
				{ defaultSortIndex: 1, id: second },
				{ defaultSortIndex: 2, id: third },
			],
		});
		expect(order).toEqual([second, first]);
	});

	test("empty allowlist excludes every slot", () => {
		const first = newModelSlotId();
		const order = mergeSlotOrder({
			repoOverrides: [],
			slots: [{ defaultSortIndex: 0, id: first }],
		});
		expect(order).toEqual([]);
	});
});

describe("slotsForRepoView", () => {
	test("excludes slots omitted from the repo allowlist", () => {
		const kept = newModelSlotId();
		const dropped = newModelSlotId();
		const repo = testRepoRef("o/r", "880001");
		const view = slotsForRepoView({
			repoOverrides: [
				{
					githubUserId: "u",
					repo,
					slotId: kept,
					sortIndex: 0,
				},
			],
			slots: [testSlot(kept), testSlot(dropped)],
		});
		expect(view.map((item) => item.id)).toEqual([kept]);
	});

	test("empty allowlist returns no slots", () => {
		const slot = newModelSlotId();
		const view = slotsForRepoView({
			repoOverrides: [],
			slots: [testSlot(slot)],
		});
		expect(view).toEqual([]);
	});
});
