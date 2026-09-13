import { d1Value } from "#/d1.ts";
import { modelSlotSelect, parseSelect } from "#/db/zod.ts";
import { effort, engineKind, modelName } from "#/domain.ts";
import type { Effort, EngineKind, ModelName, ParseResult } from "#/domain.ts";
import { accountId, modelSlotId } from "#/vault/domain.ts";
import type { AccountId, ModelSlotId } from "#/vault/domain.ts";
import type { ModelSlot } from "#/vault/model-slot.ts";
import { similarModelOption } from "#/vault/model-slot.ts";

function parseSlotIdentity(row: {
	accountId: string;
	engine: EngineKind;
	id: string;
	model: string;
}): ParseResult<{
	accountId: AccountId;
	engine: EngineKind;
	id: ModelSlotId;
	model: ModelName;
}> {
	const id = modelSlotId(row.id);
	if (id.kind === "invalid") {
		return id;
	}
	const parsedAccountId = accountId(row.accountId);
	if (parsedAccountId.kind === "invalid") {
		return parsedAccountId;
	}
	const parsedEngine = engineKind(row.engine);
	if (parsedEngine.kind === "invalid") {
		return parsedEngine;
	}
	const parsedModel = modelName(row.model);
	if (parsedModel.kind === "invalid") {
		return parsedModel;
	}
	return {
		kind: "ok",
		value: {
			accountId: parsedAccountId.value,
			engine: parsedEngine.value,
			id: id.value,
			model: parsedModel.value,
		},
	};
}

function parseSlotEffort(
	effortColumn: string | null,
): ParseResult<Effort | undefined> {
	const effortRaw = d1Value(effortColumn);
	if (effortRaw === undefined || effortRaw.length === 0) {
		return { kind: "ok", value: undefined };
	}
	return effort(effortRaw);
}

export function parseModelSlotRow(row: unknown): ParseResult<ModelSlot> {
	const selected = parseSelect(
		modelSlotSelect,
		row,
		"model slot row is invalid",
	);
	if (selected.kind === "invalid") {
		return selected;
	}
	const identity = parseSlotIdentity(selected.value);
	if (identity.kind === "invalid") {
		return identity;
	}
	const label = selected.value.label.trim();
	if (label.length === 0) {
		return { kind: "invalid", message: "model slot label is empty" };
	}
	const parsedEffort = parseSlotEffort(selected.value.effort);
	if (parsedEffort.kind === "invalid") {
		return parsedEffort;
	}
	return {
		kind: "ok",
		value: {
			...identity.value,
			createdAt: selected.value.createdAt,
			defaultSortIndex: selected.value.defaultSortIndex,
			fast: selected.value.fast === 1,
			label,
			similarModel: similarModelOption(selected.value.similarModel),
			...(parsedEffort.value === undefined
				? {}
				: { effort: parsedEffort.value }),
		},
	};
}
