import { z } from "zod";

import {
	compareNewestFirst,
	createdMsFrom,
	isCodingVendorModel,
	isEolVendorModel,
} from "./catalog-coding.ts";
import { catalogModel, effort } from "./domain.ts";
import type { CatalogModel, Effort } from "./domain.ts";
import {
	firstParsed,
	jsonObjectSchema,
	keepParsed,
	unknownArraySchema,
} from "./zod-parse.ts";

const nonEmptyStringSchema = z.string().min(1);
const booleanSchema = z.boolean();

export function displayNameFrom(
	item: Record<string, unknown>,
	keys: readonly string[],
): string | undefined {
	return firstParsed(
		nonEmptyStringSchema,
		keys.map((key) => item[key]),
	);
}

const positiveIntFromNumber = z.number().int().positive();
const positiveIntFromString = z
	.string()
	.min(1)
	.transform((value, ctx) => {
		const parsed = Number(value);
		if (!Number.isInteger(parsed) || parsed <= 0) {
			ctx.addIssue({ code: "custom", message: "expected a positive integer" });
			return z.NEVER;
		}
		return parsed;
	});
const positiveIntSchema = z.union([
	positiveIntFromNumber,
	positiveIntFromString,
]);

const effortTokenSchema = z.string().transform((value, ctx) => {
	const mapped =
		value === "xhigh" || value === "x-high" || value === "extra-high"
			? "max"
			: value;
	const parsed = effort(mapped);
	if (parsed.kind === "invalid") {
		ctx.addIssue({ code: "custom", message: parsed.message });
		return z.NEVER;
	}
	return parsed.value;
});

function uniqueEfforts(items: Effort[]): Effort[] | undefined {
	const seen = new Set<Effort>();
	const efforts: Effort[] = [];
	for (const item of items) {
		if (seen.has(item)) {
			continue;
		}
		seen.add(item);
		efforts.push(item);
	}
	return efforts.length === 0 ? undefined : efforts;
}

function effortsFromList(value: unknown): Effort[] | undefined {
	const items = unknownArraySchema.safeParse(value);
	if (!items.success) {
		return undefined;
	}
	return uniqueEfforts(keepParsed(effortTokenSchema, items.data));
}

function recordField(
	item: Record<string, unknown>,
	key: string,
): Record<string, unknown> | undefined {
	return firstParsed(jsonObjectSchema, [item[key]]);
}

function nestedRecord(
	item: Record<string, unknown>,
	path: readonly string[],
): Record<string, unknown> | undefined {
	let current: Record<string, unknown> | undefined = item;
	for (const key of path) {
		if (current === undefined) {
			return undefined;
		}
		current = recordField(current, key);
	}
	return current;
}

function firstPositiveInt(
	item: Record<string, unknown>,
	keys: readonly string[],
): number | undefined {
	return firstParsed(
		positiveIntSchema,
		keys.map((key) => item[key]),
	);
}

function contextWindowFrom(item: Record<string, unknown>): number | undefined {
	const direct = firstPositiveInt(item, [
		"context_window",
		"contextWindow",
		"context_length",
		"max_context_window_tokens",
		"max_input_tokens",
		"inputTokenLimit",
	]);
	if (direct !== undefined) {
		return direct;
	}
	const limits =
		nestedRecord(item, ["capabilities", "limits"]) ??
		recordField(item, "limits") ??
		recordField(item, "limit");
	if (limits === undefined) {
		return undefined;
	}
	return firstPositiveInt(limits, [
		"max_context_window_tokens",
		"context",
		"inputTokenLimit",
		"context_window",
	]);
}

const supportedTrueSchema = z.looseObject({ supported: z.literal(true) });

function effortsFromCapability(value: unknown): Effort[] | undefined {
	const parsed = supportedTrueSchema.safeParse(value);
	if (!parsed.success) {
		return undefined;
	}
	const tokens: string[] = [];
	for (const [key, nested] of Object.entries(parsed.data)) {
		if (key !== "supported" && supportedTrueSchema.safeParse(nested).success) {
			tokens.push(key);
		}
	}
	return effortsFromList(tokens);
}

function effortsFrom(item: Record<string, unknown>): Effort[] | undefined {
	return (
		effortsFromList(item["supportedReasoningEfforts"]) ??
		effortsFromList(item["supported_reasoning_efforts"]) ??
		effortsFromList(item["supported_reasoning_levels"]) ??
		effortsFromList(item["efforts"]) ??
		effortsFromCapability(nestedRecord(item, ["capabilities", "effort"]))
	);
}

function supportsFastFrom(item: Record<string, unknown>): boolean | undefined {
	const direct = firstParsed(booleanSchema, [
		item["fast"],
		item["supportsFast"],
		item["supports_fast"],
		item["isFast"],
	]);
	if (direct !== undefined) {
		return direct;
	}
	const supports = nestedRecord(item, ["capabilities", "supports"]);
	return firstParsed(booleanSchema, [
		supports?.["fast"],
		supports?.["fastMode"],
		supports?.["fast_mode"],
	]);
}

function extrasFrom(item: Record<string, unknown>): {
	contextWindow?: number;
	efforts?: readonly Effort[];
	supportsFast?: boolean;
} {
	const contextWindow = contextWindowFrom(item);
	const efforts = effortsFrom(item);
	const supportsFast = supportsFastFrom(item);
	return {
		...(contextWindow === undefined ? {} : { contextWindow }),
		...(efforts === undefined ? {} : { efforts }),
		...(supportsFast === undefined ? {} : { supportsFast }),
	};
}

function vendorModelId(
	item: Record<string, unknown>,
	idOf?: (item: Record<string, unknown>) => string | undefined,
): string | undefined {
	if (idOf !== undefined) {
		return idOf(item);
	}
	return firstParsed(z.string(), [item["id"]]);
}

function skipRow(ctx: z.RefinementCtx, message: string): typeof z.NEVER {
	ctx.addIssue({ code: "custom", message });
	return z.NEVER;
}

function collectedModelSchema(
	displayNameOf: (item: Record<string, unknown>) => string | undefined,
	idOf?: (item: Record<string, unknown>) => string | undefined,
) {
	return jsonObjectSchema.transform((item, ctx) => {
		if (item["type"] !== undefined && item["type"] !== "model") {
			return skipRow(ctx, "not a model row");
		}
		if (item["object"] !== undefined && item["object"] !== "model") {
			return skipRow(ctx, "not a model row");
		}
		const id = vendorModelId(item, idOf);
		if (id === undefined) {
			return skipRow(ctx, "model id is missing");
		}
		const displayName = displayNameOf(item) ?? id;
		if (
			!isCodingVendorModel({ displayName, id, item }) ||
			isEolVendorModel(item)
		) {
			return skipRow(ctx, "skipped vendor model");
		}
		const parsed = catalogModel({
			displayName,
			id,
			...extrasFrom(item),
		});
		if (parsed.kind === "invalid") {
			return skipRow(ctx, parsed.message);
		}
		return { createdMs: createdMsFrom(item), model: parsed.value };
	});
}

export function collectModels(
	items: unknown[],
	displayNameOf: (item: Record<string, unknown>) => string | undefined,
	idOf?: (item: Record<string, unknown>) => string | undefined,
): CatalogModel[] {
	return keepParsed(collectedModelSchema(displayNameOf, idOf), items)
		.map((entry, index) => ({
			createdMs: entry.createdMs,
			index,
			model: entry.model,
		}))
		.toSorted(compareNewestFirst)
		.map((entry) => entry.model);
}
