import type {
	CatalogModel,
	Effort,
	EngineKind,
} from "@hakasebot/core/domain.ts";
import { EFFORTS } from "@hakasebot/core/domain.ts";
import { errorMessage } from "@hakasebot/core/error-message.ts";
import { engineSupportsFast } from "@hakasebot/core/vault/model-slot.ts";

import { engineLabel } from "#/lab/constants.ts";
import { m as msg } from "#/paraglide/messages.js";

export type ModelPickMode = "catalog" | "custom";

export interface SlotDraft {
	accountId: string | undefined;
	effort: string;
	fast: boolean;
	label: string;
	model: string;
	pickMode: ModelPickMode;
	similarModel: boolean;
}

export const EMPTY_SLOT_DRAFT: SlotDraft = {
	accountId: undefined,
	effort: "",
	fast: false,
	label: "",
	model: "",
	pickMode: "catalog",
	similarModel: true,
};

function formatContextWindow(tokens: number): string {
	if (tokens >= 1_000_000) {
		const millions = tokens / 1_000_000;
		return Number.isInteger(millions)
			? `${String(millions)}M`
			: `${millions.toFixed(1)}M`;
	}
	if (tokens >= 1000) {
		return `${String(Math.round(tokens / 1000))}k`;
	}
	return String(tokens);
}

function effortSelectOptions(
	efforts: readonly Effort[] = EFFORTS,
): { id: string; label: string }[] {
	return [
		{ id: "", label: msg.models_effort_default_option() },
		...efforts.map((value) => ({ id: value, label: value })),
	];
}

export function catalogOptionLabel(entry: CatalogModel): string {
	const bits: string[] = [entry.id];
	if (entry.contextWindow !== undefined) {
		bits.push(formatContextWindow(entry.contextWindow));
	}
	if (entry.supportsFast === true) {
		bits.push(msg.models_fast_tag());
	}
	return bits.join(" · ");
}

export function effortOptionsFor(entry: CatalogModel | undefined): {
	id: string;
	label: string;
}[] {
	if (entry?.efforts === undefined) {
		return effortSelectOptions();
	}
	return effortSelectOptions(entry.efforts);
}

export function showFastFor(args: {
	engine: EngineKind | undefined;
	entry: CatalogModel | undefined;
}): boolean {
	if (args.engine === undefined) {
		return false;
	}
	if (args.entry?.supportsFast !== undefined) {
		return args.entry.supportsFast;
	}
	return engineSupportsFast(args.engine);
}

export function catalogMessageFor(args: {
	catalogModels: readonly CatalogModel[];
	engine: EngineKind | undefined;
	pickMode: ModelPickMode;
	query: { error: unknown; isError: boolean; isPending: boolean };
}): string | undefined {
	if (args.engine === undefined || args.pickMode !== "catalog") {
		return undefined;
	}
	if (args.query.isPending) {
		return msg.models_asking();
	}
	if (args.query.isError) {
		return errorMessage(args.query.error, msg.models_catalog_failed());
	}
	if (args.catalogModels.length === 0) {
		return msg.models_catalog_empty({ engine: engineLabel(args.engine) });
	}
	return undefined;
}
