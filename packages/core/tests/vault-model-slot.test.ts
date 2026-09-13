import { describe, expect, test } from "vitest";

import { modelName } from "#/domain.ts";
import { newAccountId, newModelSlotId } from "#/vault/domain.ts";
import {
	buildModelQueue,
	modelQueueEntryFromSlot,
	parseModelSlotInput,
} from "#/vault/model-slot.ts";
import type { ModelSlot } from "#/vault/model-slot.ts";

describe("model slots", () => {
	test("parseModelSlotInput validates engine and model", () => {
		const accountId = newAccountId();
		const parsed = parseModelSlotInput({
			accountId,
			defaultSortIndex: 0,
			engine: "claude",
			fast: true,
			label: "opus reviews",
			model: "claude-opus-5",
		});
		expect(parsed.kind).toBe("ok");
		if (parsed.kind !== "ok") {
			return;
		}
		expect(parsed.value.fast).toBe(true);
		expect(parsed.value.engine).toBe("claude");
		expect(parsed.value.similarModel).toBe(true);
	});

	test("parseModelSlotInput treats similarModel false as off", () => {
		const parsed = parseModelSlotInput({
			accountId: newAccountId(),
			defaultSortIndex: 0,
			engine: "claude",
			label: "pinned opus",
			model: "claude-opus-4-8",
			similarModel: false,
		});
		expect(parsed.kind).toBe("ok");
		if (parsed.kind !== "ok") {
			return;
		}
		expect(parsed.value.similarModel).toBe(false);
	});

	test("buildModelQueue preserves slot order", () => {
		const slotId = newModelSlotId();
		const parsedModel = modelName("gpt-5");
		if (parsedModel.kind === "invalid") {
			throw new Error(parsedModel.message);
		}
		const slot: ModelSlot = {
			accountId: newAccountId(),
			createdAt: 1,
			defaultSortIndex: 0,
			effort: "high",
			engine: "codex",
			fast: false,
			id: slotId,
			label: "codex pass",
			model: parsedModel.value,
			similarModel: true,
		};
		const queue = buildModelQueue([slot]);
		expect(queue.entries).toEqual([modelQueueEntryFromSlot(slot)]);
	});
});
