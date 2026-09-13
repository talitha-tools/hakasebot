import { z } from "zod";

import { effort, engineKind, exhaustive, modelName } from "#/domain.ts";
import type { Effort, EngineKind, ModelName, ParseResult } from "#/domain.ts";
import { unknownText } from "#/is-record.ts";
import { fromParseResult, parseJsonText, trueFlagSchema } from "#/zod-parse.ts";

import type { AccountId, ModelSlotId } from "./domain.ts";
import { accountId, modelSlotId, newModelSlotId } from "./domain.ts";

export interface ModelSlot {
	id: ModelSlotId;
	accountId: AccountId;
	engine: EngineKind;
	model: ModelName;
	effort?: Effort;
	/** Engine-specific fast/low-latency mode when the vendor supports it. */
	fast: boolean;
	/** When the stored model id leaves the catalog, use a same-family successor. Default on. */
	similarModel: boolean;
	label: string;
	defaultSortIndex: number;
	createdAt: number;
}

export interface SaveModelSlotArgs {
	githubUserId: string;
	accountId: AccountId;
	engine: EngineKind;
	model: ModelName;
	label: string;
	defaultSortIndex: number;
	effort?: Effort;
	fast?: boolean;
	similarModel?: boolean;
	slotId?: ModelSlotId;
}

/** Missing, null, or anything other than explicit false / 0 means on. */
export function similarModelOption(raw: unknown): boolean {
	return raw !== false && raw !== 0 && raw !== "0" && raw !== "false";
}

function parseOptionalEffort(
	raw: string | undefined,
): ParseResult<Effort | undefined> {
	if (raw === undefined || raw.length === 0) {
		return { kind: "ok", value: undefined };
	}
	return effort(raw);
}

function resolveSlotId(raw: string | undefined): ParseResult<ModelSlotId> {
	return raw === undefined
		? { kind: "ok", value: newModelSlotId() }
		: modelSlotId(raw);
}

export function parseModelSlotInput(args: {
	accountId: AccountId;
	engine: string;
	model: string;
	label: string;
	defaultSortIndex: number;
	effort?: string;
	fast?: boolean;
	similarModel?: boolean;
	slotId?: string;
}): ParseResult<Omit<SaveModelSlotArgs, "githubUserId">> {
	const parsedEngine = engineKind(args.engine);
	if (parsedEngine.kind === "invalid") {
		return parsedEngine;
	}
	const parsedModel = modelName(args.model);
	if (parsedModel.kind === "invalid") {
		return parsedModel;
	}
	const label = args.label.trim();
	if (label.length === 0) {
		return { kind: "invalid", message: "model slot label is empty" };
	}
	const parsedEffort = parseOptionalEffort(args.effort);
	if (parsedEffort.kind === "invalid") {
		return parsedEffort;
	}
	const id = resolveSlotId(args.slotId);
	if (id.kind === "invalid") {
		return id;
	}
	return {
		kind: "ok",
		value: {
			accountId: args.accountId,
			defaultSortIndex: args.defaultSortIndex,
			engine: parsedEngine.value,
			fast: args.fast ?? false,
			label,
			model: parsedModel.value,
			similarModel: similarModelOption(args.similarModel),
			slotId: id.value,
			...(parsedEffort.value === undefined
				? {}
				: { effort: parsedEffort.value }),
		},
	};
}

/** Runtime queue entry — credential resolved from vault by accountId. */
export interface ModelQueueEntry {
	slotId: ModelSlotId;
	accountId: AccountId;
	engine: EngineKind;
	model: ModelName;
	fast: boolean;
	effort: Effort;
	similarModel: boolean;
}

export interface ModelQueue {
	version: 1;
	entries: ModelQueueEntry[];
}

export function modelQueueEntryFromSlot(slot: ModelSlot): ModelQueueEntry {
	return {
		accountId: slot.accountId,
		engine: slot.engine,
		effort: slot.effort ?? "medium",
		fast: slot.fast,
		model: slot.model,
		similarModel: slot.similarModel,
		slotId: slot.id,
	};
}

export function buildModelQueue(slots: readonly ModelSlot[]): ModelQueue {
	return {
		entries: slots.map((slot) => modelQueueEntryFromSlot(slot)),
		version: 1,
	};
}

const coercedText = z.unknown().transform((value) => unknownText(value));

const modelQueueEntrySchema: z.ZodType<ModelQueueEntry> = z
	.object(
		{
			accountId: fromParseResult(coercedText, accountId),
			effort: z
				.unknown()
				.optional()
				.transform((raw, ctx) => {
					const parsed =
						typeof raw === "string" ? effort(raw) : effort("medium");
					if (parsed.kind === "invalid") {
						ctx.addIssue({ code: "custom", message: parsed.message });
						return z.NEVER;
					}
					return parsed.value;
				}),
			engine: fromParseResult(coercedText, engineKind),
			fast: trueFlagSchema,
			model: fromParseResult(coercedText, modelName),
			similarModel: z
				.unknown()
				.optional()
				.transform((raw) => similarModelOption(raw)),
			slotId: fromParseResult(coercedText, modelSlotId),
		},
		{ error: "model queue entry is invalid" },
	)
	.transform((item) => ({
		accountId: item.accountId,
		engine: item.engine,
		effort: item.effort,
		fast: item.fast,
		model: item.model,
		similarModel: item.similarModel,
		slotId: item.slotId,
	}));

const modelQueueSchema: z.ZodType<ModelQueue> = z.object(
	{
		entries: z.array(modelQueueEntrySchema, {
			error: "model queue entries must be an array",
		}),
		version: z.literal(1, {
			error: "model queue version is unsupported",
		}),
	},
	{ error: "model queue must be a JSON object" },
);

export function parseModelQueue(raw: string): ParseResult<ModelQueue> {
	return parseJsonText(modelQueueSchema, raw, "model queue is not valid JSON");
}

export function serializeModelQueue(queue: ModelQueue): string {
	return JSON.stringify(queue);
}

export function engineSupportsFast(engine: EngineKind): boolean {
	switch (engine) {
		case "claude":
		case "codex":
		case "cursor": {
			return true;
		}
		case "grok":
		case "antigravity": {
			return false;
		}
		default: {
			return exhaustive(engine);
		}
	}
}
